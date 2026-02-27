# -*- coding: utf-8 -*-
"""
创建 compositions 表，用于存储组合调试配置列表
每个组合由用户通过选项配置：名称、场景、默认模型等
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
            CREATE TABLE IF NOT EXISTS compositions (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                scene VARCHAR(100) NOT NULL,
                model_id VARCHAR(36),
                mcp_id VARCHAR(36),
                team_id VARCHAR(36) REFERENCES teams(id) ON DELETE CASCADE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_compositions_team_id ON compositions(team_id);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_compositions_scene ON compositions(scene);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_compositions_sort_order ON compositions(sort_order);"
        )
        print("✅ compositions 表创建成功")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
