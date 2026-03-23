# -*- coding: utf-8 -*-
"""
修复团队管理菜单 is_system_admin_only：历史迁移可能未正确设置，导致 superuser 侧栏为空
"""
import asyncio
import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

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
        # 确保 team/teams 相关菜单 is_system_admin_only=TRUE
        r = await conn.execute("""
            UPDATE permissions SET is_system_admin_only = TRUE
            WHERE (code LIKE 'menu:team%' OR code LIKE 'menu:teams%' OR resource = 'teams')
            AND (is_system_admin_only IS NULL OR is_system_admin_only = FALSE)
        """)
        print("✅ 团队管理菜单 is_system_admin_only 已修复")
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
