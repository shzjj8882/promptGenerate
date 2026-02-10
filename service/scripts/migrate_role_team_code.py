# -*- coding: utf-8 -*-
"""
为角色表添加 team_code 字段的迁移脚本
"""
import asyncio
import asyncpg
from app.core.config import settings


async def migrate_role_team_code():
    """为角色表添加 team_code 字段"""
    # 连接到 PostgreSQL
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        # 检查 team_code 字段是否已存在
        columns = await conn.fetch("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'roles' AND column_name = 'team_code'
        """)
        
        if columns:
            print("✅ team_code 字段已存在，跳过迁移")
            return
        
        print("开始迁移：为 roles 表添加 team_code 字段...")
        
        # 添加 team_code 字段
        await conn.execute("""
            ALTER TABLE roles 
            ADD COLUMN team_code VARCHAR(50) NULL;
        """)
        
        # 创建索引
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_roles_team_code ON roles(team_code);
        """)
        
        # 移除 name 和 code 的唯一约束（因为现在在团队内唯一）
        # 先检查约束是否存在
        constraints = await conn.fetch("""
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'roles' 
            AND constraint_type = 'UNIQUE'
        """)
        
        # 查找与 name 或 code 相关的唯一约束
        for constraint in constraints:
            constraint_name = constraint['constraint_name']
            # 检查约束涉及的列
            columns = await conn.fetch("""
                SELECT column_name
                FROM information_schema.key_column_usage
                WHERE constraint_name = $1 AND table_name = 'roles'
            """, constraint_name)
            
            col_names = [col['column_name'] for col in columns]
            if 'name' in col_names or 'code' in col_names:
                print(f"移除唯一约束: {constraint_name} (涉及列: {', '.join(col_names)})")
                await conn.execute(f"""
                    ALTER TABLE roles 
                    DROP CONSTRAINT IF EXISTS "{constraint_name}";
                """)
        
        # 创建团队内的唯一约束（name 和 code 在 team_code 内唯一）
        # 注意：PostgreSQL 不支持部分唯一索引，所以我们需要使用表达式索引
        await conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_name_team_unique 
            ON roles(name, team_code) 
            WHERE team_code IS NOT NULL;
        """)
        
        await conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_code_team_unique 
            ON roles(code, team_code) 
            WHERE team_code IS NOT NULL;
        """)
        
        # 对于全局角色（team_code IS NULL），保持唯一性
        await conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_name_global_unique 
            ON roles(name) 
            WHERE team_code IS NULL;
        """)
        
        await conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_code_global_unique 
            ON roles(code) 
            WHERE team_code IS NULL;
        """)
        
        print("✅ 迁移完成：已为 roles 表添加 team_code 字段和相关索引")
        
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


async def main():
    """主函数"""
    await migrate_role_team_code()


if __name__ == "__main__":
    asyncio.run(main())
