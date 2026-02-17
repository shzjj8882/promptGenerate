# -*- coding: utf-8 -*-
"""
创建 user_dashboard_config 表，用于存储用户工作台布局配置
"""
import asyncio
import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

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
            CREATE TABLE IF NOT EXISTS user_dashboard_config (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                layout JSONB NOT NULL DEFAULT '[]',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id)
            );
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_dashboard_config_user_id ON user_dashboard_config(user_id);"
        )
        print("✅ user_dashboard_config 表创建成功")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
