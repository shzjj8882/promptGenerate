# -*- coding: utf-8 -*-
"""
修复 llm_models 表的列名不一致问题
模型定义中 extra_config 映射到 config 列，但数据库可能是 extra_config
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
        # 检查是否有 extra_config 或 config 列
        columns = await conn.fetch("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'llm_models' AND column_name IN ('extra_config', 'config')
        """)
        col_names = [col['column_name'] for col in columns]
        
        if 'extra_config' in col_names and 'config' not in col_names:
            print('发现 extra_config 列，需要重命名为 config...')
            # 重命名列
            await conn.execute('ALTER TABLE llm_models RENAME COLUMN extra_config TO config')
            print('✅ 已将 extra_config 重命名为 config')
        elif 'config' in col_names:
            print('✅ config 列已存在')
        else:
            print('⚠️  两个列都不存在，创建 config 列')
            await conn.execute('ALTER TABLE llm_models ADD COLUMN config TEXT')
            print('✅ 创建 config 列')
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(fix())
