# -*- coding: utf-8 -*-
"""
移除错误的「团队认证」菜单权限 menu:config:team_auth
团队认证是按钮权限（menu:team:reset_authcode），非路由菜单
"""
import asyncio
import asyncpg
from app.core.config import settings

async def migrate():
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        # 删除 menu_configs 中的关联
        await conn.execute("""
            DELETE FROM menu_configs 
            WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'menu:config:team_auth')
        """)
        # 删除 role_permissions 中的关联
        await conn.execute("""
            DELETE FROM role_permissions 
            WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'menu:config:team_auth')
        """)
        # 删除权限
        result = await conn.execute("""
            DELETE FROM permissions WHERE code = 'menu:config:team_auth'
        """)
        if result == "DELETE 1":
            print("✅ 已移除 menu:config:team_auth（团队认证菜单）")
        else:
            print("⏭️  menu:config:team_auth 不存在，跳过")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
