# -*- coding: utf-8 -*-
"""
添加团队管理菜单权限（仅系统管理员可见）
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


# 团队管理菜单权限
TEAM_MENU_PERMISSIONS = [
    # 团队管理菜单（仅系统管理员可见）
    ("menu:teams:list", "团队管理", "teams", "menu_list", "团队管理入口，控制左侧菜单与路由可见，仅系统管理员可见", None, 10),
]


async def migrate():
    """添加团队管理菜单权限"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        inserted = 0
        for code, name, resource, action, description, parent_code, sort_order in TEAM_MENU_PERMISSIONS:
            # 检查是否已存在
            existing = await conn.fetchval("""
                SELECT id FROM permissions WHERE code = $1
            """, code)
            
            if existing:
                print(f"⏭️  菜单权限已存在，跳过: {name} ({code})")
            else:
                pid = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO permissions (id, name, code, resource, action, type, description, parent_id, sort_order, is_active, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, 'menu', $6, NULL, $7, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, pid, name, code, resource, action, description or "", sort_order)
                inserted += 1
                print(f"✅ 创建菜单权限: {name} ({code})")
        
        print(f"✅ 团队管理菜单权限迁移完成（共 {len(TEAM_MENU_PERMISSIONS)} 条，新增 {inserted} 条）")

    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
