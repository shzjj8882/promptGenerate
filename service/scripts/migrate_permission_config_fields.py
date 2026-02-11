# -*- coding: utf-8 -*-
"""
权限配置字段迁移：增加 type(菜单/接口/按钮)、type_name、group_name、is_system_admin_only
- type: menu=菜单(路由), api=接口, button=按钮
- type_name: 类型名称，用于展示
- group_name: 分组名称，用于前端 groupBy
- is_system_admin_only: 是否仅系统管理员可见，非系统管理员获取权限配置时过滤
"""
import asyncio
import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

import asyncpg
from app.core.config import settings


# resource -> group_name 映射
RESOURCE_TO_GROUP = {
    "tenant": "租户管理",
    "prompts": "提示词管理",
    "scenes": "场景管理",
    "rbac": "权限管理",
    "teams": "团队管理",
    "team": "团队",
    "config": "配置中心",
    "tables": "多维表格",
    "multi_dimension_tables": "多维表格",
}

# type -> type_name 映射
TYPE_TO_NAME = {
    "menu": "菜单权限",
    "api": "接口权限",
    "button": "按钮权限",
}


async def migrate():
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        # 1. 添加新列
        for col, col_type, default in [
            ("is_system_admin_only", "BOOLEAN NOT NULL DEFAULT FALSE", ""),
            ("type_name", "VARCHAR(50)", ""),
            ("group_name", "VARCHAR(50)", ""),
        ]:
            exists = await conn.fetchval("""
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'permissions' AND column_name = $1
            """, col)
            if not exists:
                await conn.execute(f"ALTER TABLE permissions ADD COLUMN {col} {col_type}")
                print(f"✅ 已添加列 permissions.{col}")
            else:
                print(f"⏭️  permissions.{col} 已存在，跳过")

        # 2. 更新现有记录：按钮权限 type=button
        button_actions = ("menu_create", "menu_update", "menu_delete", "menu_role_create", "menu_role_update", "menu_role_delete", "menu_user_role_assign")
        await conn.execute("""
            UPDATE permissions SET type = 'button'
            WHERE type = 'menu' AND action = ANY($1::text[])
        """, list(button_actions))
        print("✅ 已将按钮类 action 的权限 type 更新为 button")

        # 3. 更新现有记录：is_system_admin_only
        await conn.execute("""
            UPDATE permissions SET is_system_admin_only = TRUE
            WHERE code LIKE 'menu:team%' OR code LIKE 'menu:teams%' OR resource = 'teams'
        """)
        print("✅ 已设置团队管理相关权限 is_system_admin_only = TRUE")

        # 4. 更新 type_name 和 group_name
        rows = await conn.fetch("SELECT id, type, resource FROM permissions")
        for row in rows:
            type_name = TYPE_TO_NAME.get(row["type"], row["type"])
            group_name = RESOURCE_TO_GROUP.get(row["resource"], row["resource"])
            await conn.execute(
                "UPDATE permissions SET type_name = $1, group_name = $2 WHERE id = $3",
                type_name, group_name, row["id"]
            )
        print(f"✅ 已更新 {len(rows)} 条权限的 type_name 和 group_name")

        # 5. 确保新列无空值
        await conn.execute("""
            UPDATE permissions SET type_name = COALESCE(NULLIF(TRIM(type_name), ''),
                CASE type WHEN 'menu' THEN '菜单权限' WHEN 'api' THEN '接口权限' WHEN 'button' THEN '按钮权限' ELSE type END
            )
            WHERE type_name IS NULL OR TRIM(type_name) = ''
        """)
        await conn.execute("""
            UPDATE permissions SET group_name = COALESCE(NULLIF(TRIM(group_name), ''), resource)
            WHERE group_name IS NULL OR TRIM(group_name) = ''
        """)
        print("✅ 已补齐 type_name、group_name 空值")

    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
