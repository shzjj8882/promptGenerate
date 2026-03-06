# -*- coding: utf-8 -*-
"""
创建 system_dashboard_config 表，用于超级管理员的工作台配置
超级管理员使用独立的系统级配置，不混用团队用户的配置
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
            CREATE TABLE IF NOT EXISTS system_dashboard_config (
                id SERIAL PRIMARY KEY,
                layout JSONB NOT NULL DEFAULT '[]',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        # 确保有一行
        row = await conn.fetchrow("SELECT 1 FROM system_dashboard_config LIMIT 1")
        if not row:
            await conn.execute("""
                INSERT INTO system_dashboard_config (layout) VALUES ('[]'::jsonb);
            """)
        print("✅ system_dashboard_config 表创建成功")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
