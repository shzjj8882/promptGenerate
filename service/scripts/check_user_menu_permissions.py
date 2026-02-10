# -*- coding: utf-8 -*-
"""
检查用户的菜单权限
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
        # 根据 token 中的 user_id 查找用户
        user_id = "abc9c320-fc4c-4f1f-9534-f5dc59cd27d6"  # 从 token 中提取的 user_id
        
        # 获取用户信息
        user = await conn.fetchrow(
            'SELECT id, username, is_superuser, is_team_admin, team_code FROM users WHERE id = $1',
            user_id
        )
        
        if user:
            print(f'用户信息: {user["username"]}')
            print(f'  is_superuser: {user["is_superuser"]}')
            print(f'  is_team_admin: {user["is_team_admin"]}')
            print(f'  team_code: {user["team_code"]}')
            
            # 检查菜单配置
            models_menu = await conn.fetchrow(
                'SELECT id FROM permissions WHERE code = $1',
                'menu:config:models'
            )
            
            if models_menu:
                # 检查是否有菜单配置
                menu_config = await conn.fetchrow(
                    'SELECT id, parent_id, sort_order, team_id FROM menu_configs WHERE permission_id = $1',
                    models_menu["id"]
                )
                
                if menu_config:
                    print(f'\n✅ 找到菜单配置: parent_id={menu_config["parent_id"]}, sort_order={menu_config["sort_order"]}, team_id={menu_config["team_id"]}')
                else:
                    print(f'\n⚠️  未找到菜单配置（MenuConfig），菜单可能不会正确显示')
                    print(f'   菜单 ID: {models_menu["id"]}')
                    
                    # 检查其他配置中心子菜单的配置
                    parent_menu = await conn.fetchrow(
                        'SELECT id FROM permissions WHERE code = $1',
                        'menu:config'
                    )
                    if parent_menu:
                        scenes_menu = await conn.fetchrow(
                            'SELECT id FROM permissions WHERE code = $1',
                            'menu:config:scenes'
                        )
                        if scenes_menu:
                            scenes_config = await conn.fetchrow(
                                'SELECT parent_id, sort_order, team_id FROM menu_configs WHERE permission_id = $1',
                                scenes_menu["id"]
                            )
                            if scenes_config:
                                print(f'\n场景配置的菜单配置: parent_id={scenes_config["parent_id"]}, sort_order={scenes_config["sort_order"]}, team_id={scenes_config["team_id"]}')
                            
                            # 为模型管理创建菜单配置
                            print(f'\n创建模型管理的菜单配置...')
                            await conn.execute("""
                                INSERT INTO menu_configs (id, permission_id, team_id, parent_id, sort_order, created_at, updated_at)
                                VALUES (gen_random_uuid()::text, $1, NULL, $2, 104, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                                ON CONFLICT (permission_id, team_id) DO UPDATE
                                SET parent_id = EXCLUDED.parent_id,
                                    sort_order = EXCLUDED.sort_order,
                                    updated_at = CURRENT_TIMESTAMP
                            """, models_menu["id"], parent_menu["id"])
                            print('✅ 菜单配置创建成功')
        else:
            print(f'❌ 未找到用户: {user_id}')
            
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(check())
