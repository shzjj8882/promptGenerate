# -*- coding: utf-8 -*-
"""
将组合调试菜单名称改为「组合」
"""
import asyncio
import sys
from pathlib import Path
import asyncpg

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from app.core.config import settings


async def migrate():
    """将 menu:compositions:list 的 name 从「组合调试」改为「组合」"""
    conn = await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )

    try:
        result = await conn.execute(
            """
            UPDATE permissions
            SET name = '组合', updated_at = CURRENT_TIMESTAMP
            WHERE code = 'menu:compositions:list' AND name = '组合调试'
            """
        )
        if "UPDATE 1" in result or "UPDATE 0" in result:
            print("✅ 菜单名称已更新: 组合调试 → 组合")

        # 清除菜单树缓存
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

    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate())
