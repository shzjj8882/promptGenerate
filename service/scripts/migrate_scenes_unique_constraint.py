# -*- coding: utf-8 -*-
"""
修改 scenes 表的唯一约束
将 code 的单独唯一约束改为 (code, team_id) 的联合唯一约束
这样不同团队可以使用相同的场景代码
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
        print("开始修改 scenes 表的唯一约束...")
        
        # 1. 检查是否存在 code 的唯一约束
        constraints = await conn.fetch("""
            SELECT constraint_name, constraint_type
            FROM information_schema.table_constraints
            WHERE table_name = 'scenes'
            AND constraint_type = 'UNIQUE'
        """)
        
        code_unique_constraint = None
        for constraint in constraints:
            # 检查约束是否只包含 code 列
            constraint_columns = await conn.fetch("""
                SELECT column_name
                FROM information_schema.constraint_column_usage
                WHERE constraint_name = $1 AND table_name = 'scenes'
            """, constraint['constraint_name'])
            
            columns = [col['column_name'] for col in constraint_columns]
            if len(columns) == 1 and columns[0] == 'code':
                code_unique_constraint = constraint['constraint_name']
                break
        
        # 2. 删除 code 的单独唯一约束
        if code_unique_constraint:
            print(f"删除 code 的唯一约束: {code_unique_constraint}")
            await conn.execute(f'ALTER TABLE scenes DROP CONSTRAINT IF EXISTS {code_unique_constraint}')
        else:
            # 如果没有找到命名约束，可能是通过 UNIQUE 关键字创建的，尝试删除索引
            indexes = await conn.fetch("""
                SELECT indexname
                FROM pg_indexes
                WHERE tablename = 'scenes' AND indexdef LIKE '%UNIQUE%code%'
            """)
            for index in indexes:
                print(f"删除唯一索引: {index['indexname']}")
                await conn.execute(f'DROP INDEX IF EXISTS {index["indexname"]}')
        
        # 3. 检查是否已存在联合唯一索引
        existing_index = await conn.fetchrow("""
            SELECT indexname
            FROM pg_indexes
            WHERE tablename = 'scenes'
            AND indexname = 'idx_scenes_code_team_id_unique'
        """)
        
        # 4. 创建联合唯一约束 (code, team_id)
        if not existing_index:
            print("创建联合唯一索引: (code, team_id)")
            await conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_scenes_code_team_id_unique
                ON scenes(code, team_id)
            """)
            print("✅ 联合唯一索引创建成功")
        else:
            print(f"✅ 联合唯一索引已存在: {existing_index['indexname']}")
        
        # 5. 验证索引
        final_indexes = await conn.fetch("""
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'scenes'
            AND indexdef LIKE '%UNIQUE%'
        """)
        print("\n当前 scenes 表的唯一索引:")
        for idx in final_indexes:
            print(f"  - {idx['indexname']}: {idx['indexdef']}")
        
        print("\n✨ 迁移完成！")
        
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
