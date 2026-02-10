# -*- coding: utf-8 -*-
"""
修复 llm_models 表的 config 列
"""
import asyncio
import sys
from pathlib import Path
import asyncpg

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings


async def fix():
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        # 检查 llm_models 表的列名
        columns = await conn.fetch("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'llm_models'
            ORDER BY ordinal_position
        """)
        print('llm_models 表的列:')
        for col in columns:
            print(f'  - {col["column_name"]}')
        
        # 检查是否有 config 列
        has_config = any(col['column_name'] == 'config' for col in columns)
        if not has_config:
            print('\n⚠️  缺少 config 列，正在添加...')
            await conn.execute('ALTER TABLE llm_models ADD COLUMN IF NOT EXISTS config TEXT')
            print('✅ 添加 config 列')
        else:
            print('\n✅ config 列已存在')
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(fix())
