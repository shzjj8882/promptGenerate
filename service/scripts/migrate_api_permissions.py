# -*- coding: utf-8 -*-
"""
将接口权限（type=api）插入 permissions 表。
与租户等路由的 require_permission("tenant:list" 等) 对应，角色分配「接口权限」后可访问相应接口。
执行后，GET /admin/rbac/permissions/grouped 会返回这些接口权限，供前端在「接口权限」Tab 下分配。
"""
import asyncio
import uuid
import asyncpg
from app.core.config import settings


# 接口权限种子：(code, name, resource, action, description)
# code 与 require_permission("tenant:list" 等) 及前端 BUTTON_PERMISSIONS 一致
API_PERMISSIONS = [
    # 租户管理接口（对应 app/routers/admin/tenants.py）
    ("tenant:list", "租户-列表(接口)", "tenant", "list", "租户列表接口权限"),
    ("tenant:detail", "租户-详情(接口)", "tenant", "detail", "租户详情接口权限"),
    ("tenant:create", "租户-创建(接口)", "tenant", "create", "租户创建接口权限"),
    ("tenant:update", "租户-更新(接口)", "tenant", "update", "租户更新接口权限"),
    ("tenant:delete", "租户-删除(接口)", "tenant", "delete", "租户删除接口权限"),
    # 提示词管理接口（对应 app/routers/admin/prompts.py，前端 BUTTON_PERMISSIONS.prompts）
    ("prompts:create", "提示词-创建(接口)", "prompts", "create", "提示词创建接口权限"),
    ("prompts:update", "提示词-更新(接口)", "prompts", "update", "提示词更新接口权限"),
    ("prompts:delete", "提示词-删除(接口)", "prompts", "delete", "提示词删除接口权限"),
    # 场景管理接口（对应 app/routers/admin/scenes.py）
    ("scenes:list", "场景-列表(接口)", "scenes", "list", "场景列表接口权限"),
    ("scenes:create", "场景-创建(接口)", "scenes", "create", "场景创建接口权限"),
    ("scenes:update", "场景-更新(接口)", "scenes", "update", "场景更新接口权限"),
    ("scenes:delete", "场景-删除(接口)", "scenes", "delete", "场景删除接口权限"),
]


async def migrate():
    """插入接口权限（type=api，code 已存在则跳过）"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        inserted = 0
        for code, name, resource, action, description in API_PERMISSIONS:
            pid = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO permissions (id, name, code, resource, action, type, description, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, 'api', $6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (code) DO NOTHING
            """, pid, name, code, resource, action, description or "")
            inserted += 1
        print(f"✅ 接口权限种子已写入（共 {len(API_PERMISSIONS)} 条，若 code 已存在则跳过）")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
