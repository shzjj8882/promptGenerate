# -*- coding: utf-8 -*-
"""
验证 placeholders 表的字段是否存在
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import AsyncSessionLocal, init_db, engine
from sqlalchemy import text


async def verify_placeholder_fields():
    """验证 placeholders 表的字段"""
    async with engine.begin() as conn:
        # 检查字段是否存在
        check_column_sql = """
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'placeholders' 
        AND column_name IN ('data_source_type', 'data_type', 'table_id', 'table_column_key', 'table_row_id_param_key')
        ORDER BY column_name;
        """
        result = await conn.execute(text(check_column_sql))
        rows = result.fetchall()
        
        expected_columns = {
            'data_source_type',
            'data_type',
            'table_id',
            'table_column_key',
            'table_row_id_param_key'
        }
        
        existing_columns = {row[0] for row in rows}
        
        print("=" * 60)
        print("字段验证结果：")
        print("=" * 60)
        
        if rows:
            print(f"\n找到 {len(rows)} 个字段：")
            for row in rows:
                print(f"  - {row[0]}: {row[1]} (nullable: {row[2]}, default: {row[3]})")
        else:
            print("\n❌ 未找到任何新字段！")
        
        missing_columns = expected_columns - existing_columns
        if missing_columns:
            print(f"\n❌ 缺失的字段: {', '.join(missing_columns)}")
            return False
        else:
            print(f"\n✅ 所有字段都存在！")
            return True


async def main():
    """主函数"""
    try:
        await init_db()
        success = await verify_placeholder_fields()
        if success:
            print("\n✅ 验证通过")
        else:
            print("\n❌ 验证失败，请重新运行迁移脚本")
            sys.exit(1)
    except Exception as e:
        print(f"❌ 验证失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
