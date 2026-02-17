# -*- coding: utf-8 -*-
"""
添加「重置团队认证码」权限（工作台 Dashboard 上的「重置认证码」按钮）
- 菜单按钮权限：menu:team:reset_authcode，控制按钮显隐
- 接口权限：team:reset_authcode，控制 /admin/teams/my-team/reset-authcode 接口
"""
import asyncio
import uuid
import asyncpg
from app.core.config import settings


# 重置认证码权限（resource=team 用于团队成员级操作，非 teams 团队管理）
# menu:team:reset_authcode 为按钮权限（type=button），控制 Dashboard 上的「重置认证码」按钮
MENU_BUTTON_PERMISSION = ("menu:team:reset_authcode", "团队-重置认证码", "team", "menu_reset_authcode", "button", "工作台「重置认证码」按钮")
API_PERMISSION = ("team:reset_authcode", "团队-重置认证码(接口)", "team", "reset_authcode", "api", "重置当前用户团队认证码接口权限")


async def migrate():
    """插入重置认证码权限（按钮 + 接口）"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        inserted = 0
        for code, name, resource, action, perm_type, description in [MENU_BUTTON_PERMISSION, API_PERMISSION]:
            pid = str(uuid.uuid4())
            # menu:team:reset_authcode 为例外，团队管理员可分配，故 is_system_admin_only=False
            is_sys_admin_only = False
            result = await conn.execute("""
                INSERT INTO permissions (id, name, code, resource, action, type, description, sort_order, is_active, is_system_admin_only, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 0, true, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (code) DO UPDATE SET
                    type = EXCLUDED.type,
                    description = EXCLUDED.description,
                    is_system_admin_only = EXCLUDED.is_system_admin_only,
                    updated_at = CURRENT_TIMESTAMP
            """, pid, name, code, resource, action, perm_type, description or "", is_sys_admin_only)
            if result == "INSERT 0 1":
                inserted += 1
                print(f"✅ 创建权限: {name} ({code})")
            else:
                print(f"✅ 更新权限: {name} ({code}) type={perm_type}")

        print(f"✅ 重置认证码权限迁移完成（共 2 条，新增 {inserted} 条）")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
