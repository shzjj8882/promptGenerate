# -*- coding: utf-8 -*-
"""
为多维表格添加 code 字段
"""
import asyncio
import sys
from pathlib import Path
import uuid
import asyncpg

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings


async def migrate():
    """为多维表格表添加 code 字段"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        # 1. 检查是否已有 code 列
        col = await conn.fetchval("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'multi_dimension_tables' AND column_name = 'code'
        """)
        
        if not col:
            # 2. 添加 code 列（允许为空，先不设置唯一约束）
            await conn.execute("""
                ALTER TABLE multi_dimension_tables 
                ADD COLUMN code VARCHAR(255)
            """)
            print("✅ code 列已添加")
            
            # 3. 为现有数据生成 code
            tables = await conn.fetch("SELECT id FROM multi_dimension_tables WHERE code IS NULL")
            for table in tables:
                table_code = f"table_{table['id'][:8]}"
                await conn.execute("""
                    UPDATE multi_dimension_tables 
                    SET code = $1 
                    WHERE id = $2
                """, table_code, table['id'])
            print(f"✅ 已为 {len(tables)} 条现有数据生成 code")
            
            # 4. 设置 code 列为 NOT NULL 和 UNIQUE
            await conn.execute("""
                ALTER TABLE multi_dimension_tables 
                ALTER COLUMN code SET NOT NULL
            """)
            await conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_multi_dimension_tables_code 
                ON multi_dimension_tables(code)
            """)
            print("✅ code 列已设置为 NOT NULL 和 UNIQUE")
        else:
            print("⏭️ code 列已存在，跳过")
        
        print("✅ 迁移完成")

    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
