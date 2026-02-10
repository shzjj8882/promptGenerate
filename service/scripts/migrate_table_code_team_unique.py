# -*- coding: utf-8 -*-
"""
数据库迁移脚本 - 修改多维表格 code 字段的唯一约束为按团队的部分唯一索引
将 code 字段的唯一约束改为只在 is_active=True 时唯一，并且按 team_id 区分
允许不同团队使用相同的 code，已删除的记录（is_active=False）允许重复使用 code
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
    """修改 code 字段的唯一约束为按团队的部分唯一索引"""
    async with AsyncSessionLocal() as session:
        try:
            # 1. 检查是否存在旧的唯一索引
            check_index_sql = """
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'multi_dimension_tables' 
            AND indexname = 'idx_multi_dimension_tables_code_active';
            """
            
            result = await session.execute(text(check_index_sql))
            index_info = result.fetchone()
            
            if index_info:
                print(f"找到现有索引: {index_info[0]}")
                print(f"定义: {index_info[1]}")
                
                # 检查索引是否已经包含 team_id
                if 'team_id' in index_info[1]:
                    print("✅ 索引已包含 team_id，无需修改")
                    return
            else:
                print("⚠️  未找到索引 idx_multi_dimension_tables_code_active")
            
            # 2. 删除旧的唯一索引
            drop_index_sql = "DROP INDEX IF EXISTS idx_multi_dimension_tables_code_active;"
            await session.execute(text(drop_index_sql))
            await session.commit()
            print("✅ 已删除旧的唯一索引")
            
            # 3. 创建新的部分唯一索引（包含 team_id）
            # 对于 team_id 为 NULL 的情况，使用 COALESCE 处理
            # PostgreSQL 的部分唯一索引需要处理 NULL 值
            create_partial_index_sql = """
            CREATE UNIQUE INDEX idx_multi_dimension_tables_code_active 
            ON multi_dimension_tables (code, COALESCE(team_id, '')) 
            WHERE is_active = TRUE;
            """
            
            await session.execute(text(create_partial_index_sql))
            await session.commit()
            print("✅ 已创建新的部分唯一索引（包含 team_id）")
            
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
            
            print("\n✅ 迁移完成！现在不同团队可以使用相同的 code 了。")
            
        except Exception as e:
            await session.rollback()
            print(f"❌ 迁移失败: {e}")
            import traceback
            traceback.print_exc()
            raise


if __name__ == "__main__":
    asyncio.run(migrate())
