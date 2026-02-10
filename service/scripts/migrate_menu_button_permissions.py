# -*- coding: utf-8 -*-
"""
为菜单权限补充「按钮」级权限：各资源下的创建/编辑/删除等，由菜单权限控制显隐（与后端接口校验无关）。
执行后，角色分配「菜单权限」时可见：租户管理（列表+新建+编辑+删除）、提示词/权限管理同理。
"""
import asyncio
import uuid
import asyncpg
from app.core.config import settings


# 菜单按钮权限种子：code -> (name, resource, action, description)
# resource 与现有菜单一致：tenant/prompts/rbac，便于在「菜单权限」里按功能组展示
MENU_BUTTON_PERMISSIONS = [
    # 租户管理：路由 + 新建/编辑/删除
    ("menu:tenant:create", "租户-新建", "tenant", "menu_create", "租户管理页「新建租户」按钮，由菜单权限控制"),
    ("menu:tenant:update", "租户-编辑", "tenant", "menu_update", "租户管理页「编辑」按钮，由菜单权限控制"),
    ("menu:tenant:delete", "租户-删除", "tenant", "menu_delete", "租户管理页「删除」按钮，由菜单权限控制"),
    # 提示词管理
    ("menu:prompts:create", "提示词-创建", "prompts", "menu_create", "提示词管理页创建入口（缺失卡片编辑），由菜单权限控制"),
    ("menu:prompts:update", "提示词-编辑", "prompts", "menu_update", "提示词管理页「编辑」按钮，由菜单权限控制"),
    ("menu:prompts:delete", "提示词-删除", "prompts", "menu_delete", "提示词管理页删除能力，由菜单权限控制"),
    # 场景管理
    ("menu:scenes:create", "场景-新建", "scenes", "menu_create", "提示词管理页「添加场景」按钮，由菜单权限控制"),
    ("menu:scenes:update", "场景-编辑", "scenes", "menu_update", "提示词管理页「编辑场景」按钮，由菜单权限控制"),
    ("menu:scenes:delete", "场景-删除", "scenes", "menu_delete", "提示词管理页「删除场景」按钮，由菜单权限控制"),
    # 权限管理（角色/用户角色）
    ("menu:rbac:role:create", "权限-新建角色", "rbac", "menu_role_create", "权限管理页「新建角色」按钮，由菜单权限控制"),
    ("menu:rbac:role:update", "权限-编辑角色", "rbac", "menu_role_update", "权限管理页「编辑」角色按钮，由菜单权限控制"),
    ("menu:rbac:role:delete", "权限-删除角色", "rbac", "menu_role_delete", "权限管理页「删除」角色按钮，由菜单权限控制"),
    ("menu:rbac:user_role:assign", "权限-分配角色", "rbac", "menu_user_role_assign", "权限管理页「分配角色」按钮，由菜单权限控制"),
]


async def migrate():
    """插入菜单按钮权限（type=menu，code 已存在则跳过）"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        n = 0
        for code, name, resource, action, description in MENU_BUTTON_PERMISSIONS:
            pid = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO permissions (id, name, code, resource, action, type, description, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, 'menu', $6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (code) DO NOTHING
            """, pid, name, code, resource, action, description or "")
            n += 1
        print(f"✅ 菜单按钮权限种子已写入（共 {len(MENU_BUTTON_PERMISSIONS)} 条，若 code 已存在则跳过）")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
