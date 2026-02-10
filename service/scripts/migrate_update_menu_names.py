# -*- coding: utf-8 -*-
"""
更新菜单权限的名称
将菜单名称改为更简洁的格式
"""
import asyncio
import asyncpg
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings


async def update_menu_names():
    """更新菜单权限的名称"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        print("\n开始更新菜单权限名称...")
        
        # 定义菜单 code 到新名称的映射
        menu_name_updates = [
            ("menu:tenant:list", "租户列表"),
            ("menu:prompts:list", "提示词列表"),
            ("menu:rbac", "权限管理"),
        ]
        
        updated_count = 0
        
        for code, new_name in menu_name_updates:
            # 检查菜单是否存在
            existing = await conn.fetchrow("""
                SELECT id, name FROM permissions WHERE code = $1
            """, code)
            
            if not existing:
                print(f"⏭️  跳过 {code}：菜单权限不存在")
                continue
            
            old_name = existing['name']
            
            if old_name == new_name:
                print(f"⏭️  跳过 {code}：名称已经是 {new_name}")
                continue
            
            # 更新名称
            await conn.execute("""
                UPDATE permissions 
                SET name = $1, updated_at = CURRENT_TIMESTAMP
                WHERE code = $2
            """, new_name, code)
            
            updated_count += 1
            print(f"✅ 已更新 {code}: {old_name} -> {new_name}")
        
        print(f"\n{'='*60}")
        print(f"✅ 迁移完成")
        print(f"   - 已更新: {updated_count} 个菜单权限名称")
        print(f"{'='*60}\n")
        
    finally:
        await conn.close()


async def main():
    """主函数"""
    await update_menu_names()


if __name__ == "__main__":
    asyncio.run(main())
