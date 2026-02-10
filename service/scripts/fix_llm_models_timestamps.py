# -*- coding: utf-8 -*-
"""
修复 llm_models 表的时间戳字段
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
        # 检查 llm_models 表的列
        columns = await conn.fetch("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'llm_models'
            ORDER BY ordinal_position
        """)
        print('llm_models 表的列:')
        for col in columns:
            print(f'  {col["column_name"]}: {col["data_type"]} (nullable: {col["is_nullable"]}, default: {col["column_default"]})')
        
        # 检查是否有 created_at 和 updated_at
        has_created_at = any(col['column_name'] == 'created_at' for col in columns)
        has_updated_at = any(col['column_name'] == 'updated_at' for col in columns)
        
        if not has_created_at or not has_updated_at:
            print('\n⚠️  缺少时间戳字段，正在添加...')
            if not has_created_at:
                await conn.execute('ALTER TABLE llm_models ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL')
                print('✅ 添加 created_at 字段')
            if not has_updated_at:
                await conn.execute('ALTER TABLE llm_models ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL')
                print('✅ 添加 updated_at 字段')
            
            # 添加触发器来更新 updated_at
            await conn.execute("""
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = NOW();
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
            """)
            
            await conn.execute("""
                DROP TRIGGER IF EXISTS update_llm_models_updated_at ON llm_models;
                CREATE TRIGGER update_llm_models_updated_at
                BEFORE UPDATE ON llm_models
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
            """)
            print('✅ 创建 updated_at 自动更新触发器')
        else:
            print('\n✅ 时间戳字段已存在')
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(fix())
