# -*- coding: utf-8 -*-
"""
为 placeholders 表添加方法相关字段
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import AsyncSessionLocal, init_db, engine
from sqlalchemy import text


async def add_method_fields_to_placeholders():
    """为 placeholders 表添加方法相关字段"""
    async with engine.begin() as conn:
        # 检查字段是否已存在
        check_column_sql = """
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'placeholders' 
        AND column_name IN ('method', 'method_params', 'tenant_param_key');
        """
        result = await conn.execute(text(check_column_sql))
        existing_columns = {row[0] for row in result.fetchall()}
        
        # 添加 method 字段
        if 'method' not in existing_columns:
            await conn.execute(text("ALTER TABLE placeholders ADD COLUMN method VARCHAR;"))
            print("已添加 method 字段")
        
        # 添加 method_params 字段
        if 'method_params' not in existing_columns:
            await conn.execute(text("ALTER TABLE placeholders ADD COLUMN method_params TEXT;"))
            print("已添加 method_params 字段")
        
        # 添加 tenant_param_key 字段
        if 'tenant_param_key' not in existing_columns:
            await conn.execute(text("ALTER TABLE placeholders ADD COLUMN tenant_param_key VARCHAR;"))
            print("已添加 tenant_param_key 字段")
        
        if existing_columns == {'method', 'method_params', 'tenant_param_key'}:
            print("所有字段已存在，跳过添加")


async def main():
    """主函数"""
    try:
        await init_db()
        await add_method_fields_to_placeholders()
        print("\n迁移完成！")
    except Exception as e:
        print(f"\n迁移失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())

