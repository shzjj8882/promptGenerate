# -*- coding: utf-8 -*-
"""
在 entrypoint 中、uvicorn 启动前执行一次：若无超级管理员则创建 admin。
- 需在 .env 中设置 INITIAL_ADMIN_PASSWORD（≥6 位），首次创建时使用该密码
- 已存在 admin 则不输出任何内容。使用 asyncpg 避免 SQLAlchemy 模型加载问题。
"""
import asyncio
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.security import get_password_hash


async def main():
    import asyncpg
    from asyncpg.exceptions import UniqueViolationError

    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        # 若已存在 admin，直接返回（不输出）
        exists = await conn.fetchval(
            "SELECT 1 FROM users WHERE username = 'admin' LIMIT 1"
        )
        if exists:
            return

        # 首次创建 admin 时必须由用户在 .env 中设置 INITIAL_ADMIN_PASSWORD
        admin_password = (settings.INITIAL_ADMIN_PASSWORD or "").strip()
        if len(admin_password) < 6:
            print(
                "\n[ERROR] 首次创建 admin 需在 .env 中设置 INITIAL_ADMIN_PASSWORD（≥6 位）\n"
                "示例: INITIAL_ADMIN_PASSWORD=YourSecurePassword123\n"
                "设置后重启: docker compose up -d\n",
                flush=True,
            )
            sys.exit(1)

        admin_id = str(uuid.uuid4())
        hashed = get_password_hash(admin_password)
        try:
            await conn.execute(
                """
                INSERT INTO users (id, username, email, full_name, hashed_password,
                    is_active, is_superuser, is_team_admin, team_code, team_id, created_at, updated_at)
                VALUES ($1, 'admin', 'admin@example.com', 'System Administrator', $2,
                    TRUE, TRUE, FALSE, NULL, NULL, NOW(), NOW())
                """,
                admin_id,
                hashed,
            )
        except UniqueViolationError:
            # 并发时另一进程已创建，不输出
            return
        print("[OK] 已创建默认系统管理员 admin（密码为您在 .env 中设置的 INITIAL_ADMIN_PASSWORD）", flush=True)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
