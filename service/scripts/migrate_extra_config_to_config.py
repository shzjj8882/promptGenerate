# -*- coding: utf-8 -*-
"""
迁移 extra_config 数据到 config 列，然后删除 extra_config 列
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
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        # 检查是否有数据在 extra_config 中
        rows_with_extra_config = await conn.fetch("""
            SELECT id, extra_config, config
            FROM llm_models
            WHERE extra_config IS NOT NULL AND extra_config != ''
        """)
        
        if rows_with_extra_config:
            print(f'发现 {len(rows_with_extra_config)} 条记录有 extra_config 数据，正在迁移到 config...')
            for row in rows_with_extra_config:
                # 如果 config 为空，则使用 extra_config 的值
                if not row['config']:
                    await conn.execute("""
                        UPDATE llm_models
                        SET config = $1
                        WHERE id = $2
                    """, row['extra_config'], row['id'])
                    print(f'  迁移记录 {row["id"]}: extra_config -> config')
        
        # 删除 extra_config 列
        print('\n删除 extra_config 列...')
        await conn.execute('ALTER TABLE llm_models DROP COLUMN IF EXISTS extra_config')
        print('✅ 已删除 extra_config 列')
        
        # 验证
        columns = await conn.fetch("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'llm_models' AND column_name IN ('config', 'extra_config')
        """)
        remaining = [col['column_name'] for col in columns]
        if 'config' in remaining and 'extra_config' not in remaining:
            print('✅ 迁移完成，现在只有 config 列')
        else:
            print(f'⚠️  列状态: {remaining}')
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
