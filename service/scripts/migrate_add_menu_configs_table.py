# -*- coding: utf-8 -*-
"""
创建菜单配置表，支持团队级别的菜单顺序和层级覆盖
系统管理员编辑的是全局配置（team_id 为 NULL）
团队管理员编辑的是团队配置（team_id 为该团队的 ID）
"""
import asyncio
import asyncpg
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings


async def create_menu_configs_table():
    """创建菜单配置表"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        print("\n开始创建菜单配置表...")
        print("=" * 80)
        
        # 检查表是否已存在
        table_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'menu_configs'
            )
        """)
        
        if table_exists:
            print("⏭️  表 menu_configs 已存在，跳过创建")
        else:
            # 创建菜单配置表
            await conn.execute("""
                CREATE TABLE menu_configs (
                    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
                    permission_id VARCHAR NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
                    team_id VARCHAR REFERENCES teams(id) ON DELETE CASCADE,
                    parent_id VARCHAR REFERENCES permissions(id) ON DELETE SET NULL,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(permission_id, team_id)
                )
            """)
            print("✅ 已创建表 menu_configs")
            
            # 创建索引
            await conn.execute("""
                CREATE INDEX idx_menu_configs_permission_id ON menu_configs(permission_id)
            """)
            await conn.execute("""
                CREATE INDEX idx_menu_configs_team_id ON menu_configs(team_id)
            """)
            await conn.execute("""
                CREATE INDEX idx_menu_configs_parent_id ON menu_configs(parent_id)
            """)
            print("✅ 已创建索引")
        
        # 从 permissions 表迁移现有数据到 menu_configs（仅菜单权限，team_id 为 NULL 表示全局配置）
        print("\n迁移现有菜单配置数据...")
        
        # 检查是否已有数据
        existing_count = await conn.fetchval("SELECT COUNT(*) FROM menu_configs")
        if existing_count > 0:
            print(f"⏭️  menu_configs 表已有 {existing_count} 条数据，跳过迁移")
        else:
            # 迁移菜单权限的配置（parent_id, sort_order）
            await conn.execute("""
                INSERT INTO menu_configs (id, permission_id, team_id, parent_id, sort_order, created_at, updated_at)
                SELECT 
                    gen_random_uuid()::text as id,
                    id as permission_id,
                    NULL as team_id,
                    parent_id,
                    sort_order,
                    created_at,
                    updated_at
                FROM permissions
                WHERE type = 'menu'
                  AND (action = 'menu_list' OR action = 'menu')
            """)
            
            migrated_count = await conn.fetchval("SELECT COUNT(*) FROM menu_configs")
            print(f"✅ 已迁移 {migrated_count} 条菜单配置数据（全局配置）")
        
        print("\n" + "=" * 80)
        print("✅ 迁移完成")
        print("=" * 80)
        
    finally:
        await conn.close()


async def main():
    """主函数"""
    await create_menu_configs_table()


if __name__ == "__main__":
    asyncio.run(main())
