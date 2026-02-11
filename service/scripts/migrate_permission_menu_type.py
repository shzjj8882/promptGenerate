# -*- coding: utf-8 -*-
"""
为权限表增加 type(menu/api)，并初始化菜单权限种子数据。
包含：路由级（列表/入口）+ 按钮级（新建/编辑/删除等），均在「菜单分配」里按功能组展示。
"""
import asyncio
import uuid
import asyncpg
from app.core.config import settings


# 菜单权限种子：code -> (name, resource, action, description)
# 路由级：控制侧栏与路由可见
MENU_ROUTE_PERMISSIONS = [
    ("menu:tenant:list", "租户列表", "tenant", "menu_list", "租户管理入口，控制左侧菜单与路由可见"),
    ("menu:prompts:list", "提示词列表", "prompts", "menu_list", "提示词管理入口，控制左侧菜单与路由可见"),
    ("menu:rbac", "权限管理", "rbac", "menu", "权限管理入口，控制左侧菜单与路由可见"),
]
# 按钮级：控制页面上新建/编辑/删除等显隐，在「菜单分配」里作为功能点分配
MENU_BUTTON_PERMISSIONS = [
    ("menu:tenant:create", "租户-新建", "tenant", "menu_create", "租户管理页「新建租户」按钮"),
    ("menu:tenant:update", "租户-编辑", "tenant", "menu_update", "租户管理页「编辑」按钮"),
    ("menu:tenant:delete", "租户-删除", "tenant", "menu_delete", "租户管理页「删除」按钮"),
    ("menu:prompts:create", "提示词-创建", "prompts", "menu_create", "提示词管理页创建入口"),
    ("menu:prompts:update", "提示词-编辑", "prompts", "menu_update", "提示词管理页「编辑」按钮"),
    ("menu:prompts:delete", "提示词-删除", "prompts", "menu_delete", "提示词管理页删除能力"),
    ("menu:scenes:create", "场景-新建", "scenes", "menu_create", "提示词管理页「添加场景」按钮，由菜单权限控制"),
    ("menu:scenes:update", "场景-编辑", "scenes", "menu_update", "提示词管理页「编辑场景」按钮，由菜单权限控制"),
    ("menu:scenes:delete", "场景-删除", "scenes", "menu_delete", "提示词管理页「删除场景」按钮，由菜单权限控制"),
    ("menu:rbac:role:create", "权限-新建角色", "rbac", "menu_role_create", "权限管理页「新建角色」按钮"),
    ("menu:rbac:role:update", "权限-编辑角色", "rbac", "menu_role_update", "权限管理页「编辑」角色按钮"),
    ("menu:rbac:role:delete", "权限-删除角色", "rbac", "menu_role_delete", "权限管理页「删除」角色按钮"),
    ("menu:rbac:user_role:assign", "权限-分配角色", "rbac", "menu_user_role_assign", "权限管理页「分配角色」按钮"),
]
MENU_PERMISSIONS = MENU_ROUTE_PERMISSIONS + MENU_BUTTON_PERMISSIONS


async def migrate():
    """增加 type 列并插入菜单权限"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        # 1. 检查是否已有 type 列，没有则添加
        col = await conn.fetchval("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'permissions' AND column_name = 'type'
        """)
        if not col:
            await conn.execute("""
                ALTER TABLE permissions ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'api'
            """)
            await conn.execute("UPDATE permissions SET type = 'api' WHERE type IS NULL OR type = ''")
            print("✅ permissions.type 列已添加，默认值 api")
        else:
            print("⏭️ permissions.type 已存在，跳过")

        # 2. 插入菜单权限（code 唯一，已存在则忽略）
        for code, name, resource, action, description in MENU_PERMISSIONS:
            pid = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO permissions (id, name, code, resource, action, type, description, parent_id, sort_order, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, 'menu', $6, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (code) DO NOTHING
            """, pid, name, code, resource, action, description or "")
        print(f"✅ 菜单权限种子已写入（路由 {len(MENU_ROUTE_PERMISSIONS)} 条 + 按钮 {len(MENU_BUTTON_PERMISSIONS)} 条，若 code 已存在则跳过）")

    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
