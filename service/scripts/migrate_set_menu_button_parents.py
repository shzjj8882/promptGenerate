# -*- coding: utf-8 -*-
"""
设置菜单按钮权限的父菜单关系
将按钮权限（如 menu:tenant:create）设置为对应列表菜单（如 menu:tenant:list）的子菜单
"""
import asyncio
import asyncpg
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings


async def set_menu_button_parents():
    """设置菜单按钮权限的父菜单关系"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    
    try:
        print("\n开始设置菜单按钮权限的父菜单关系...")
        
        # 定义菜单按钮权限与父菜单的映射关系
        # (按钮权限 code, 父菜单 code)
        button_parent_mapping = [
            # 租户管理
            ("menu:tenant:create", "menu:tenant:list"),
            ("menu:tenant:update", "menu:tenant:list"),
            ("menu:tenant:delete", "menu:tenant:list"),
            
            # 提示词管理
            ("menu:prompts:create", "menu:prompts:list"),
            ("menu:prompts:update", "menu:prompts:list"),
            ("menu:prompts:delete", "menu:prompts:list"),
            
            # 场景管理（提示词的子菜单）
            ("menu:scenes:create", "menu:prompts:list"),
            ("menu:scenes:update", "menu:prompts:list"),
            ("menu:scenes:delete", "menu:prompts:list"),
            
            # 权限管理
            ("menu:rbac:role:create", "menu:rbac"),
            ("menu:rbac:role:update", "menu:rbac"),
            ("menu:rbac:role:delete", "menu:rbac"),
            ("menu:rbac:user_role:assign", "menu:rbac"),
        ]
        
        # 获取所有父菜单的 id 映射
        parent_menu_codes = list(set([parent_code for _, parent_code in button_parent_mapping]))
        parent_menu_rows = await conn.fetch("""
            SELECT id, code FROM permissions 
            WHERE code = ANY($1::text[])
        """, parent_menu_codes)
        
        parent_menu_map = {row['code']: row['id'] for row in parent_menu_rows}
        
        # 检查缺失的父菜单
        missing_parents = set(parent_menu_codes) - set(parent_menu_map.keys())
        if missing_parents:
            print(f"\n⚠️  警告：以下父菜单不存在：{', '.join(missing_parents)}")
            print("请先确保这些菜单权限已创建")
        
        # 更新按钮权限的 parent_id
        updated_count = 0
        skipped_count = 0
        
        for button_code, parent_code in button_parent_mapping:
            if parent_code not in parent_menu_map:
                print(f"⏭️  跳过 {button_code}：父菜单 {parent_code} 不存在")
                skipped_count += 1
                continue
            
            parent_id = parent_menu_map[parent_code]
            
            # 更新 parent_id
            result = await conn.execute("""
                UPDATE permissions 
                SET parent_id = $1, updated_at = CURRENT_TIMESTAMP
                WHERE code = $2 AND type = 'menu'
            """, parent_id, button_code)
            
            if result == "UPDATE 1":
                updated_count += 1
                print(f"✅ 已设置 {button_code} 的父菜单为 {parent_code}")
            else:
                # 检查按钮权限是否存在
                button_exists = await conn.fetchval("""
                    SELECT EXISTS(SELECT 1 FROM permissions WHERE code = $1)
                """, button_code)
                
                if not button_exists:
                    print(f"⏭️  跳过 {button_code}：按钮权限不存在")
                    skipped_count += 1
                else:
                    print(f"⚠️  {button_code} 更新失败（可能已设置）")
        
        print(f"\n{'='*60}")
        print(f"✅ 迁移完成")
        print(f"   - 已更新: {updated_count} 个按钮权限")
        print(f"   - 已跳过: {skipped_count} 个按钮权限")
        print(f"{'='*60}\n")
        
    finally:
        await conn.close()


async def main():
    """主函数"""
    await set_menu_button_parents()


if __name__ == "__main__":
    asyncio.run(main())
