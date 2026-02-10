# -*- coding: utf-8 -*-
"""
检查模型管理菜单权限
"""
import asyncio
import sys
from pathlib import Path
import asyncpg

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings


async def check():
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )
    try:
        # 检查模型管理菜单是否存在
        result = await conn.fetch(
            'SELECT id, name, code, parent_id, sort_order, is_active FROM permissions WHERE code = $1',
            'menu:config:models'
        )
        if result:
            for row in result:
                print(f'✅ 找到菜单: {row["name"]} ({row["code"]})')
                print(f'   parent_id={row["parent_id"]}')
                print(f'   sort_order={row["sort_order"]}')
                print(f'   is_active={row["is_active"]}')
        else:
            print('❌ 未找到菜单 menu:config:models')
        
        # 检查配置中心父菜单
        parent = await conn.fetchrow(
            'SELECT id, name, code FROM permissions WHERE code = $1',
            'menu:config'
        )
        if parent:
            print(f'\n✅ 父菜单存在: {parent["name"]} (id={parent["id"]})')
            
            # 检查所有配置中心的子菜单
            children = await conn.fetch(
                'SELECT name, code, sort_order FROM permissions WHERE parent_id = $1 ORDER BY sort_order',
                parent["id"]
            )
            print(f'\n配置中心子菜单列表（共 {len(children)} 个）:')
            for child in children:
                print(f'  - {child["name"]} ({child["code"]}), sort_order={child["sort_order"]}')
        else:
            print('❌ 父菜单 menu:config 不存在')
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(check())
