# -*- coding: utf-8 -*-
"""
重置 admin 用户密码（忘记密码时使用）
用法:
  python scripts/reset_admin_password.py [新密码]
  或: NEW_PASSWORD=xxx python scripts/reset_admin_password.py
  
Docker:
  docker compose run --rm service python scripts/reset_admin_password.py [新密码]
"""
import asyncio
import sys
import os

# 确保能导入 app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.security import get_password_hash


async def reset_admin_password(new_password: str):
    """重置 admin 用户密码"""
    import asyncpg

    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        user = await conn.fetchrow(
            "SELECT id, username FROM users WHERE username = 'admin'"
        )
        if not user:
            print("❌ 未找到 admin 用户")
            return False

        hashed = get_password_hash(new_password)
        await conn.execute(
            "UPDATE users SET hashed_password = $1, updated_at = NOW() WHERE username = 'admin'",
            hashed,
        )
        print("=" * 50)
        print("✅ admin 密码已重置")
        print("  用户名: admin")
        print("  新密码: " + new_password)
        print("=" * 50)
        return True
    finally:
        await conn.close()


def main():
    # 优先从参数获取，其次从环境变量
    new_password = None
    if len(sys.argv) >= 2:
        new_password = sys.argv[1]
    if not new_password:
        new_password = os.environ.get("NEW_PASSWORD")
    if not new_password:
        print("用法: python scripts/reset_admin_password.py <新密码>")
        print("  或: NEW_PASSWORD=xxx python scripts/reset_admin_password.py")
        print("  新密码至少 6 位（符合前端登录规则）")
        sys.exit(1)
    if len(new_password) < 6:
        print("❌ 新密码至少需要 6 个字符")
        sys.exit(1)

    asyncio.run(reset_admin_password(new_password))


if __name__ == "__main__":
    main()
