# -*- coding: utf-8 -*-
"""
添加独立的组合调试菜单权限（与提示词管理平级）
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


# 独立的组合菜单权限
COMPOSITIONS_MENU = (
    "menu:compositions:list",
    "组合",
    "compositions",
    "menu_list",
    "提示词 + LLM 的聊天/接口调试，与提示词管理独立",
    None,
    45,  # 排在提示词(40?)之后、配置中心之前
)


async def migrate():
    """添加组合调试独立菜单"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        code, name, resource, action, description, parent_code, sort_order = COMPOSITIONS_MENU
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

        # 添加 MenuConfig（团队管理员等依赖此配置显示菜单）
        comp_perm_id_for_config = await conn.fetchval(
            "SELECT id FROM permissions WHERE code = 'menu:compositions:list'"
        )
        if comp_perm_id_for_config:
            existing_config = await conn.fetchrow(
                "SELECT id FROM menu_configs WHERE permission_id = $1 AND team_id IS NULL",
                comp_perm_id_for_config,
            )
            if not existing_config:
                await conn.execute(
                    """
                    INSERT INTO menu_configs (id, permission_id, team_id, parent_id, sort_order, created_at, updated_at)
                    VALUES (gen_random_uuid()::text, $1, NULL, NULL, 45, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """,
                    comp_perm_id_for_config,
                )
                print("✅ 已添加组合的 MenuConfig（全局）")
            else:
                await conn.execute(
                    """
                    UPDATE menu_configs SET sort_order = 45, updated_at = CURRENT_TIMESTAMP
                    WHERE permission_id = $1 AND team_id IS NULL
                    """,
                    comp_perm_id_for_config,
                )
                print("✅ 已更新组合的 MenuConfig")

        # 将组合调试权限分配给所有已有「提示词管理」权限的角色
        comp_perm_id = await conn.fetchval(
            "SELECT id FROM permissions WHERE code = 'menu:compositions:list'"
        )
        prompts_perm_id = await conn.fetchval(
            "SELECT id FROM permissions WHERE code = 'menu:prompts:list'"
        )
        if comp_perm_id and prompts_perm_id:
            rows = await conn.fetch("""
                SELECT rp.role_id FROM role_permissions rp
                WHERE rp.permission_id = $1
            """, prompts_perm_id)
            added = 0
            for row in rows:
                try:
                    await conn.execute("""
                        INSERT INTO role_permissions (role_id, permission_id)
                        VALUES ($1, $2)
                        ON CONFLICT (role_id, permission_id) DO NOTHING
                    """, row["role_id"], comp_perm_id)
                    added += 1
                except Exception:
                    pass
            if added > 0:
                print(f"✅ 已将组合调试权限分配给 {added} 个角色")

        # 清除菜单树缓存，使新菜单立即生效
        try:
            import redis.asyncio as redis
            redis_client = redis.Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                password=settings.REDIS_PASSWORD or None,
                db=settings.REDIS_DB,
                decode_responses=True,
            )
            keys = await redis_client.keys("menu_tree:v1:*")
            if keys:
                await redis_client.delete(*keys)
                print(f"✅ 已清除 {len(keys)} 个菜单树缓存")
            await redis_client.aclose()
        except Exception as e:
            print(f"⚠️  清除缓存失败（可忽略，请刷新页面或重新登录）: {e}")

        print("✅ 组合菜单权限迁移完成")

    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
