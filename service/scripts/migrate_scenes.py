# -*- coding: utf-8 -*-
"""
创建 scenes 表。
执行前需已存在 users、tenants 等表；场景由管理后台创建。
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate():
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS scenes (
                id VARCHAR(36) PRIMARY KEY,
                code VARCHAR(64) NOT NULL UNIQUE,
                name VARCHAR(200) NOT NULL,
                is_predefined BOOLEAN NOT NULL DEFAULT FALSE,
                team_code VARCHAR(64),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_scenes_code ON scenes(code);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_scenes_team_code ON scenes(team_code);")

        print("✅ scenes 表创建/更新成功")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
