# -*- coding: utf-8 -*-
"""
检查 llm_models 表的完整结构
"""
import asyncio
import sys
from pathlib import Path
import asyncpg

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings


async def check():
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        # 检查所有列
        columns = await conn.fetch("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'llm_models'
            ORDER BY ordinal_position
        """)
        print('llm_models 表的所有列:')
        for col in columns:
            print(f'  - {col["column_name"]} ({col["data_type"]}, nullable: {col["is_nullable"]})')
        
        # 特别检查 config 和 extra_config
        config_cols = [col for col in columns if col['column_name'] in ('config', 'extra_config')]
        if config_cols:
            print('\n配置相关列:')
            for col in config_cols:
                print(f'  - {col["column_name"]}')
        else:
            print('\n⚠️  未找到 config 或 extra_config 列')
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(check())
