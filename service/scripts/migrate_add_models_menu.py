# -*- coding: utf-8 -*-
"""
添加模型管理菜单权限
"""
import asyncio
import sys
from pathlib import Path
import uuid
import asyncpg

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings


# 模型管理菜单权限
MODELS_MENU_PERMISSIONS = [
    ("menu:config:models", "模型管理", "config", "menu_list", "模型配置入口", "menu:config", 104),
]


async def migrate():
    """插入模型管理菜单权限"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        # 获取父菜单 ID
        parent_id = await conn.fetchval("SELECT id FROM permissions WHERE code = 'menu:config'")
        if not parent_id:
            print("❌ 找不到父菜单 menu:config，请先运行 migrate_add_config_menu.py")
            return
        
        # 创建子菜单
        for code, name, resource, action, description, parent_code, sort_order in MODELS_MENU_PERMISSIONS:
            pid = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO permissions (id, name, code, resource, action, type, description, parent_id, sort_order, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, 'menu', $6, $7, $8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (code) DO UPDATE
                SET name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    sort_order = EXCLUDED.sort_order,
                    updated_at = CURRENT_TIMESTAMP
            """, pid, name, code, resource, action, description or "", parent_id, sort_order)
            print(f"✅ 创建/更新菜单: {name} ({code})")
            
            # 获取实际插入的菜单 ID（如果已存在，则查询）
            actual_menu_id = await conn.fetchval("SELECT id FROM permissions WHERE code = $1", code)
            
            # 创建菜单配置（MenuConfig），用于菜单树显示
            # 检查是否已存在配置
            existing_config = await conn.fetchrow(
                "SELECT id FROM menu_configs WHERE permission_id = $1 AND team_id IS NULL",
                actual_menu_id
            )
            
            if not existing_config:
                config_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO menu_configs (id, permission_id, team_id, parent_id, sort_order, created_at, updated_at)
                    VALUES ($1, $2, NULL, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, config_id, actual_menu_id, parent_id, sort_order)
                print(f"✅ 创建菜单配置: {name} (MenuConfig)")
            else:
                # 更新现有配置
                await conn.execute("""
                    UPDATE menu_configs
                    SET parent_id = $1, sort_order = $2, updated_at = CURRENT_TIMESTAMP
                    WHERE permission_id = $3 AND team_id IS NULL
                """, parent_id, sort_order, actual_menu_id)
                print(f"✅ 更新菜单配置: {name} (MenuConfig)")
        
        print("\n✨ 迁移完成！")
        
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
