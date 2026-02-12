# -*- coding: utf-8 -*-
"""
添加通知中心 API 权限（config:notification:list, config:notification:update）及按钮权限
"""
import asyncio
import sys
import uuid
from pathlib import Path

import asyncpg

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings

# 接口权限
API_PERMISSIONS = [
    ("config:notification:list", "通知配置-列表", "notification", "list", "获取通知配置列表"),
    ("config:notification:update", "通知配置-更新", "notification", "update", "更新通知配置（SendCloud等）"),
]
# 按钮权限（用于编辑卡片）
BUTTON_PERMISSIONS = [
    ("menu:config:notification:edit", "通知配置-编辑", "notification", "menu_edit", "编辑通知配置按钮"),
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
        menu_id = await conn.fetchval("SELECT id FROM permissions WHERE code = 'menu:config:notification'")
        if not menu_id:
            print("❌ 找不到 menu:config:notification，请先运行 migrate_add_notification_menu.py")
            return

        for code, name, resource, action, description in API_PERMISSIONS:
            pid = str(uuid.uuid4())
            await conn.execute(
                """
                INSERT INTO permissions (id, name, code, resource, action, type, description, parent_id, sort_order, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, 'api', $6, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (code) DO NOTHING
                """,
                pid, name, code, resource, action, description or "",
            )
            print(f"✅ API 权限: {name} ({code})")

        for code, name, resource, action, description in BUTTON_PERMISSIONS:
            pid = str(uuid.uuid4())
            await conn.execute(
                """
                INSERT INTO permissions (id, name, code, resource, action, type, description, parent_id, sort_order, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, 'button', $6, $7, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (code) DO NOTHING
                """,
                pid, name, code, resource, action, description or "", menu_id,
            )
            print(f"✅ 按钮权限: {name} ({code})")

        print("✅ 通知中心权限迁移完成")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
