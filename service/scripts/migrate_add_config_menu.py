# -*- coding: utf-8 -*-
"""
添加配置中心菜单权限及其子菜单（场景配置、占位符配置、多维表格）
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


# 配置中心菜单权限（父菜单）
# 注：menu:config:tables 已迁移为独立的 menu:tables:list，若已存在则跳过避免 name 重复
CONFIG_MENU_PERMISSIONS = [
    # 父菜单：配置中心
    ("menu:config", "配置中心", "config", "menu", "配置中心入口，控制左侧菜单与路由可见", None, 100),
    # 子菜单：场景配置
    ("menu:config:scenes", "场景配置", "config", "menu_list", "场景值配置入口", "menu:config", 101),
    # 子菜单：占位符配置
    ("menu:config:placeholders", "占位符配置", "config", "menu_list", "占位符编辑设计入口", "menu:config", 102),
    # 子菜单：多维表格（若 menu:tables:list 已存在则跳过，避免 ix_permissions_name 冲突）
    ("menu:config:tables", "多维表格", "config", "menu_list", "多维表格配置入口", "menu:config", 103),
]


async def migrate():
    """插入配置中心菜单权限（支持父子关系）"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        # 先创建父菜单，再创建子菜单
        parent_id_map = {}  # code -> id 映射
        
        # 第一遍：创建所有菜单权限（先创建父菜单）
        for code, name, resource, action, description, parent_code, sort_order in CONFIG_MENU_PERMISSIONS:
            if parent_code is None:
                # 父菜单
                pid = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO permissions (id, name, code, resource, action, type, description, parent_id, sort_order, is_active, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, 'menu', $6, NULL, $7, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT (code) DO UPDATE
                    SET name = EXCLUDED.name,
                        description = EXCLUDED.description,
                        sort_order = EXCLUDED.sort_order,
                        updated_at = CURRENT_TIMESTAMP
                """, pid, name, code, resource, action, description or "", sort_order)
                
                # 获取实际插入的 ID（如果已存在，则查询）
                actual_id = await conn.fetchval("SELECT id FROM permissions WHERE code = $1", code)
                parent_id_map[code] = actual_id
                print(f"✅ 创建/更新父菜单: {name} ({code})")
        
        # 第二遍：创建子菜单（使用父菜单的 ID）
        # 若 menu:tables:list 已存在（多维表格已迁移为独立菜单），则跳过 menu:config:tables，避免 name 重复
        tables_list_exists = await conn.fetchval("SELECT id FROM permissions WHERE code = 'menu:tables:list'")
        for code, name, resource, action, description, parent_code, sort_order in CONFIG_MENU_PERMISSIONS:
            if parent_code is not None:
                if code == "menu:config:tables" and tables_list_exists:
                    print(f"⏭️  跳过 menu:config:tables（多维表格已迁移为独立菜单 menu:tables:list）")
                    continue
                # 子菜单
                parent_id = parent_id_map.get(parent_code)
                if not parent_id:
                    print(f"⚠️  警告: 找不到父菜单 {parent_code}，跳过子菜单 {code}")
                    continue
                
                pid = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO permissions (id, name, code, resource, action, type, description, parent_id, sort_order, is_active, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, 'menu', $6, $7, $8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT (code) DO UPDATE
                    SET name = EXCLUDED.name,
                        description = EXCLUDED.description,
                        parent_id = EXCLUDED.parent_id,
                        sort_order = EXCLUDED.sort_order,
                        updated_at = CURRENT_TIMESTAMP
                """, pid, name, code, resource, action, description or "", parent_id, sort_order)
                print(f"✅ 创建/更新子菜单: {name} ({code})")
        
        print(f"✅ 配置中心菜单权限已写入（共 {len(CONFIG_MENU_PERMISSIONS)} 条）")

    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
