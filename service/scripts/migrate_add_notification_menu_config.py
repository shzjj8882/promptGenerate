# -*- coding: utf-8 -*-
"""
为通知中心菜单添加 MenuConfig，确保在配置中心正确显示
"""
import asyncio
import sys
import uuid
from pathlib import Path

import asyncpg

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings

NOTIFICATION_MENU_CODE = "menu:config:notification"
PARENT_CODE = "menu:config"
SORT_ORDER = 106


async def migrate():
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        parent_id = await conn.fetchval("SELECT id FROM permissions WHERE code = $1", PARENT_CODE)
        if not parent_id:
            print("❌ 找不到父菜单 menu:config")
            return

        menu_id = await conn.fetchval("SELECT id FROM permissions WHERE code = $1", NOTIFICATION_MENU_CODE)
        if not menu_id:
            print("❌ 找不到通知中心菜单，请先运行 migrate_add_notification_menu.py")
            return

        existing = await conn.fetchrow(
            "SELECT id FROM menu_configs WHERE permission_id = $1 AND team_id IS NULL",
            menu_id,
        )
        if not existing:
            config_id = str(uuid.uuid4())
            await conn.execute(
                """
                INSERT INTO menu_configs (id, permission_id, team_id, parent_id, sort_order, created_at, updated_at)
                VALUES ($1, $2, NULL, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """,
                config_id,
                menu_id,
                parent_id,
                SORT_ORDER,
            )
            print("✅ 创建通知中心菜单配置 (MenuConfig)")
        else:
            await conn.execute(
                """
                UPDATE menu_configs
                SET parent_id = $1, sort_order = $2, updated_at = CURRENT_TIMESTAMP
                WHERE permission_id = $3 AND team_id IS NULL
                """,
                parent_id,
                SORT_ORDER,
                menu_id,
            )
            print("✅ 更新通知中心菜单配置 (MenuConfig)")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
