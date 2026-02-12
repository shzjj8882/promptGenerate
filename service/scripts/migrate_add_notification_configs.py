# -*- coding: utf-8 -*-
"""
创建 notification_configs 表
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
            CREATE TABLE IF NOT EXISTS notification_configs (
                id VARCHAR(36) PRIMARY KEY,
                type VARCHAR(64) NOT NULL UNIQUE,
                name VARCHAR(255) NOT NULL,
                config TEXT,
                team_id VARCHAR(36) REFERENCES teams(id) ON DELETE CASCADE,
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_notification_configs_type ON notification_configs(type);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_notification_configs_team_id ON notification_configs(team_id);")
        print("✅ notification_configs 表创建成功")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
