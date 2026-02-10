# -*- coding: utf-8 -*-
"""
为 placeholders 表添加多维表格相关字段
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import AsyncSessionLocal, init_db, engine
from sqlalchemy import text


async def add_table_fields_to_placeholders():
    """为 placeholders 表添加多维表格相关字段"""
    async with engine.begin() as conn:
        # 检查字段是否已存在
        check_column_sql = """
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'placeholders' 
        AND column_name IN ('data_source_type', 'data_type', 'table_id', 'table_column_key', 'table_row_id_param_key');
        """
        result = await conn.execute(text(check_column_sql))
        existing_columns = {row[0] for row in result.fetchall()}
        
        # 添加 data_source_type 字段
        if 'data_source_type' not in existing_columns:
            await conn.execute(text("ALTER TABLE placeholders ADD COLUMN data_source_type VARCHAR DEFAULT 'user_input';"))
            print("已添加 data_source_type 字段")
        
        # 添加 data_type 字段
        if 'data_type' not in existing_columns:
            await conn.execute(text("ALTER TABLE placeholders ADD COLUMN data_type VARCHAR;"))
            print("已添加 data_type 字段")
        
        # 添加 table_id 字段
        if 'table_id' not in existing_columns:
            await conn.execute(text("ALTER TABLE placeholders ADD COLUMN table_id VARCHAR;"))
            # 添加外键约束（可选，如果表存在）
            try:
                await conn.execute(text("""
                    ALTER TABLE placeholders 
                    ADD CONSTRAINT fk_placeholders_table_id 
                    FOREIGN KEY (table_id) 
                    REFERENCES multi_dimension_tables(id) 
                    ON DELETE SET NULL;
                """))
                print("已添加 table_id 字段和外键约束")
            except Exception as e:
                print(f"添加 table_id 外键约束失败（可能表不存在）: {e}")
                print("已添加 table_id 字段（无外键约束）")
        
        # 添加 table_column_key 字段
        if 'table_column_key' not in existing_columns:
            await conn.execute(text("ALTER TABLE placeholders ADD COLUMN table_column_key VARCHAR;"))
            print("已添加 table_column_key 字段")
        
        # 添加 table_row_id_param_key 字段
        if 'table_row_id_param_key' not in existing_columns:
            await conn.execute(text("ALTER TABLE placeholders ADD COLUMN table_row_id_param_key VARCHAR;"))
            print("已添加 table_row_id_param_key 字段")
        
        # 添加索引
        try:
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_placeholders_table_id ON placeholders(table_id);"))
            print("已添加 table_id 索引")
        except Exception as e:
            print(f"添加索引失败: {e}")
        
        if existing_columns == {'data_source_type', 'data_type', 'table_id', 'table_column_key', 'table_row_id_param_key'}:
            print("所有字段已存在，跳过添加")


async def main():
    """主函数"""
    try:
        await init_db()
        await add_table_fields_to_placeholders()
        print("✅ 迁移完成")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
