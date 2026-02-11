# -*- coding: utf-8 -*-
"""
为 mcp_configs 表添加 transport_type 字段（sse | streamable_http）
"""
import asyncio
import sys
from pathlib import Path

import asyncpg

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings


async def migrate():
    """添加 transport_type 列"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        # 检查列是否已存在
        row = await conn.fetchrow(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'mcp_configs' AND column_name = 'transport_type'
            """
        )
        if row:
            print("✅ transport_type 列已存在，跳过")
            return

        await conn.execute(
            """
            ALTER TABLE mcp_configs
            ADD COLUMN transport_type VARCHAR(32) NOT NULL DEFAULT 'sse'
            """
        )
        print("✅ mcp_configs 表已添加 transport_type 列（默认 sse）")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
