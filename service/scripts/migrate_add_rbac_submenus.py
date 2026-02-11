# -*- coding: utf-8 -*-
"""
迁移脚本：为权限管理添加三个子菜单
- 角色管理 (menu:rbac:roles:list)
- 用户权限分配 (menu:rbac:user_roles:list)
- 菜单管理 (menu:rbac:menus:list)
"""
import asyncio
import uuid
import asyncpg
from app.core.config import settings


# 权限管理子菜单权限：(code, name, resource, action, description)
# action 必须为 menu_list 才能被菜单树接口返回
RBAC_SUBMENUS = [
    ("menu:rbac:roles:list", "角色管理", "rbac", "menu_list", "角色管理入口，控制左侧菜单与路由可见"),
    ("menu:rbac:user_roles:list", "用户权限分配", "rbac", "menu_list", "用户权限分配入口，控制左侧菜单与路由可见"),
    ("menu:rbac:menus:list", "菜单管理", "rbac", "menu_list", "菜单管理入口，控制左侧菜单与路由可见"),
]


async def migrate():
    """插入权限管理子菜单权限（type=menu，code 已存在则跳过）"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        # 获取权限管理父菜单的 ID
        parent_menu_id = await conn.fetchval("""
            SELECT id FROM permissions WHERE code = 'menu:rbac'
        """)
        
        if not parent_menu_id:
            print("⚠️  未找到权限管理父菜单 (menu:rbac)，跳过创建子菜单")
            return
        
        inserted = 0
        for idx, (code, name, resource, action, description) in enumerate(RBAC_SUBMENUS):
            pid = str(uuid.uuid4())
            sort_order = idx + 1
            result = await conn.execute("""
                INSERT INTO permissions (id, name, code, resource, action, type, description, parent_id, sort_order, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, 'menu', $6, $7, $8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (code) DO NOTHING
            """, pid, name, code, resource, action, description or "", parent_menu_id, sort_order)
            if result == "INSERT 0 1":
                inserted += 1
                print(f"✅ 创建子菜单权限: {name} ({code})")
            else:
                print(f"⏭️  子菜单权限已存在，跳过: {name} ({code})")
        
        print(f"✅ 权限管理子菜单权限迁移完成（共 {len(RBAC_SUBMENUS)} 条，新增 {inserted} 条）")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
