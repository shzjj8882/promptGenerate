# -*- coding: utf-8 -*-
"""
添加独立的多维表格菜单权限（不在配置中心下）
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


# 独立的多维表格菜单权限
TABLES_MENU_PERMISSIONS = [
    # 独立菜单：多维表格（不在配置中心下）
    ("menu:tables:list", "多维表格", "tables", "menu_list", "多维表格管理入口，控制左侧菜单与路由可见", None, 50),
]


async def migrate():
    """将多维表格菜单改为独立菜单（不在配置中心下）"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        # 1. 检查是否存在 menu:config:tables（配置中心下的）
        existing_config_tables = await conn.fetchval("""
            SELECT id FROM permissions WHERE code = 'menu:config:tables'
        """)
        
        if existing_config_tables:
            # 如果存在，更新它：改为独立的菜单（移除 parent_id，更新 code）
            await conn.execute("""
                UPDATE permissions 
                SET code = 'menu:tables:list',
                    name = '多维表格',
                    resource = 'tables',
                    action = 'menu_list',
                    description = '多维表格管理入口，控制左侧菜单与路由可见',
                    parent_id = NULL,
                    sort_order = 50,
                    updated_at = CURRENT_TIMESTAMP
                WHERE code = 'menu:config:tables'
            """)
            print("✅ 已将 menu:config:tables 更新为独立的 menu:tables:list 菜单")
        else:
            # 如果不存在，创建新的独立菜单
            for code, name, resource, action, description, parent_code, sort_order in TABLES_MENU_PERMISSIONS:
                pid = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO permissions (id, name, code, resource, action, type, description, parent_id, sort_order, is_active, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, 'menu', $6, NULL, $7, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT (code) DO UPDATE
                    SET name = EXCLUDED.name,
                        description = EXCLUDED.description,
                        sort_order = EXCLUDED.sort_order,
                        parent_id = NULL,
                        updated_at = CURRENT_TIMESTAMP
                """, pid, name, code, resource, action, description or "", sort_order)
                print(f"✅ 创建/更新菜单: {name} ({code})")
        
        print(f"✅ 多维表格菜单权限迁移完成")

    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
