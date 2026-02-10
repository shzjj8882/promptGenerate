# -*- coding: utf-8 -*-
"""
数据库迁移脚本 - 修改多维表格 code 字段的唯一约束为部分唯一索引
将 code 字段的唯一约束改为只在 is_active=True 时唯一，允许已删除的记录（is_active=False）重复使用 code
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import AsyncSessionLocal, engine
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def migrate():
    """修改 code 字段的唯一约束为部分唯一索引"""
    async with AsyncSessionLocal() as session:
        try:
            # 1. 检查是否存在旧的唯一约束或索引
            check_constraint_sql = """
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'multi_dimension_tables' 
            AND constraint_type = 'UNIQUE' 
            AND constraint_name LIKE '%code%';
            """
            
            check_index_sql = """
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename = 'multi_dimension_tables' 
            AND indexname LIKE '%code%';
            """
            
            # 检查约束
            result = await session.execute(text(check_constraint_sql))
            constraints = result.fetchall()
            
            # 检查索引
            result = await session.execute(text(check_index_sql))
            indexes = result.fetchall()
            
            print("检查现有的约束和索引...")
            if constraints:
                print(f"找到唯一约束: {[c[0] for c in constraints]}")
            if indexes:
                print(f"找到索引: {[i[0] for i in indexes]}")
            
            # 2. 删除旧的唯一约束和索引（如果存在）
            # PostgreSQL 中，unique=True 会创建一个唯一约束，名称通常是 "multi_dimension_tables_code_key" 或类似
            # 先获取所有相关的约束名称
            get_constraints_sql = """
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'multi_dimension_tables' 
            AND constraint_type = 'UNIQUE' 
            AND (
                constraint_name LIKE '%code%' 
                OR constraint_name = 'multi_dimension_tables_code_key'
            );
            """
            
            result = await session.execute(text(get_constraints_sql))
            constraint_names = [row[0] for row in result.fetchall()]
            
            # 删除所有找到的唯一约束
            for constraint_name in constraint_names:
                drop_constraint_sql = f"""
                ALTER TABLE multi_dimension_tables 
                DROP CONSTRAINT IF EXISTS {constraint_name};
                """
                await session.execute(text(drop_constraint_sql))
                print(f"✅ 已删除唯一约束: {constraint_name}")
            
            # 删除可能存在的唯一索引（包括所有可能的名称变体）
            # 注意：需要分别执行，因为 prepared statement 不支持多个命令
            drop_index1_sql = "DROP INDEX IF EXISTS idx_multi_dimension_tables_code;"
            drop_index2_sql = "DROP INDEX IF EXISTS ix_multi_dimension_tables_code;"
            await session.execute(text(drop_index1_sql))
            await session.execute(text(drop_index2_sql))
            print("✅ 已删除旧的唯一索引（如果存在）")
            
            await session.commit()
            print("✅ 已提交删除操作")
            
            # 3. 创建部分唯一索引（只在 is_active=True 时唯一）
            create_partial_index_sql = """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_multi_dimension_tables_code_active 
            ON multi_dimension_tables (code) 
            WHERE is_active = TRUE;
            """
            
            await session.execute(text(create_partial_index_sql))
            await session.commit()
            print("✅ 已创建部分唯一索引（只在 is_active=True 时唯一）")
            
            # 4. 验证索引创建成功
            verify_sql = """
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'multi_dimension_tables' 
            AND indexname = 'idx_multi_dimension_tables_code_active';
            """
            
            result = await session.execute(text(verify_sql))
            index_info = result.fetchone()
            
            if index_info:
                print(f"✅ 索引创建成功: {index_info[0]}")
                print(f"   定义: {index_info[1]}")
            else:
                print("⚠️  警告: 无法验证索引是否创建成功")
            
            print("\n✅ 迁移完成！现在已删除的记录（is_active=False）可以重复使用 code 了。")
            
        except Exception as e:
            await session.rollback()
            print(f"❌ 迁移失败: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(migrate())
