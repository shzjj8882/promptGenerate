# -*- coding: utf-8 -*-
"""
添加 MCP 配置菜单权限（menu:config:mcp）
"""
import asyncio
import sys
import uuid
from pathlib import Path

import asyncpg

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings

# MCP 菜单权限
MCP_MENU_PERMISSION = (
    "menu:config:mcp",
    "MCP 配置",
    "config",
    "menu_list",
    "MCP 服务配置入口",
    "menu:config",
    105,
)


async def migrate():
    """插入 MCP 菜单权限"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        code, name, resource, action, description, parent_code, sort_order = MCP_MENU_PERMISSION

        # 获取父菜单 menu:config 的 ID
        parent_id = await conn.fetchval("SELECT id FROM permissions WHERE code = $1", parent_code)
        if not parent_id:
            print("❌ 找不到父菜单 menu:config，请先运行 migrate_add_config_menu.py")
            return

        pid = str(uuid.uuid4())
        await conn.execute(
            """
            INSERT INTO permissions (id, name, code, resource, action, type, description, parent_id, sort_order, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, 'menu', $6, $7, $8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (code) DO UPDATE
            SET name = EXCLUDED.name,
                description = EXCLUDED.description,
                parent_id = EXCLUDED.parent_id,
                sort_order = EXCLUDED.sort_order,
                updated_at = CURRENT_TIMESTAMP
            """,
            pid,
            name,
            code,
            resource,
            action,
            description or "",
            parent_id,
            sort_order,
        )
        print(f"✅ 创建/更新 MCP 菜单: {name} ({code})")

    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
