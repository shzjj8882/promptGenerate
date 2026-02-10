# -*- coding: utf-8 -*-
"""
为权限表添加菜单层级支持（parent_id 和 sort_order 字段）
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.database import AsyncSessionLocal, init_db, engine
from sqlalchemy import text


async def add_menu_hierarchy_fields():
    """为 permissions 表添加菜单层级字段"""
    async with engine.begin() as conn:
        # 检查 parent_id 字段是否存在
        check_parent_id = """
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'permissions' 
        AND column_name = 'parent_id';
        """
        result = await conn.execute(text(check_parent_id))
        has_parent_id = result.fetchone() is not None
        
        # 检查 sort_order 字段是否存在
        check_sort_order = """
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'permissions' 
        AND column_name = 'sort_order';
        """
        result = await conn.execute(text(check_sort_order))
        has_sort_order = result.fetchone() is not None
        
        # 添加 parent_id 字段
        if not has_parent_id:
            await conn.execute(text("""
                ALTER TABLE permissions 
                ADD COLUMN parent_id VARCHAR;
            """))
            print("✅ 已添加 parent_id 字段")
            
            # 添加外键约束
            await conn.execute(text("""
                ALTER TABLE permissions 
                ADD CONSTRAINT fk_permissions_parent_id 
                FOREIGN KEY (parent_id) 
                REFERENCES permissions(id) 
                ON DELETE SET NULL;
            """))
            print("✅ 已添加 parent_id 外键约束")
            
            # 添加索引
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_permissions_parent_id 
                ON permissions(parent_id);
            """))
            print("✅ 已添加 parent_id 索引")
        else:
            print("⏭️ parent_id 字段已存在，跳过")
        
        # 添加 sort_order 字段
        if not has_sort_order:
            await conn.execute(text("""
                ALTER TABLE permissions 
                ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
            """))
            print("✅ 已添加 sort_order 字段")
            
            # 添加索引
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_permissions_sort_order 
                ON permissions(sort_order);
            """))
            print("✅ 已添加 sort_order 索引")
        else:
            print("⏭️ sort_order 字段已存在，跳过")


async def main():
    """主函数"""
    try:
        await init_db()
        await add_menu_hierarchy_fields()
        print("✅ 迁移完成")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
