# -*- coding: utf-8 -*-
"""
统一菜单名称：租户列表→租户信息、提示词列表→提示词、用户权限分配→权限分配、
菜单管理→路由管理、组合调试→组合模式
"""
import asyncio
import asyncpg
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings

# 菜单 code -> 新名称（与前端、数据库统一）
MENU_NAME_UPDATES = [
    ("menu:tenant:list", "租户信息"),
    ("menu:prompts:list", "提示词"),
    ("menu:rbac:roles:list", "角色管理"),
    ("menu:rbac:user_roles:list", "权限分配"),
    ("menu:rbac:menus:list", "路由管理"),
    ("menu:compositions:list", "组合模式"),
]


async def migrate():
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        print("\n开始统一菜单名称...")
        updated_count = 0

        for code, new_name in MENU_NAME_UPDATES:
            existing = await conn.fetchrow(
                "SELECT id, name FROM permissions WHERE code = $1", code
            )
            if not existing:
                print(f"⏭️  跳过 {code}：菜单权限不存在")
                continue

            old_name = existing["name"]
            if old_name == new_name:
                print(f"⏭️  跳过 {code}：名称已是 {new_name}")
                continue

            await conn.execute(
                """
                UPDATE permissions
                SET name = $1, updated_at = CURRENT_TIMESTAMP
                WHERE code = $2
                """,
                new_name,
                code,
            )
            updated_count += 1
            print(f"✅ 已更新 {code}: {old_name} -> {new_name}")

        print(f"\n{'='*60}")
        print(f"✅ 迁移完成，已更新 {updated_count} 个菜单权限名称")
        print(f"{'='*60}\n")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
