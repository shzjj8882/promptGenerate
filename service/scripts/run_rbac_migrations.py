# -*- coding: utf-8 -*-
"""
在 entrypoint 中、uvicorn 启动前执行 RBAC/菜单 迁移。
确保 permissions 表在服务启动前已填充，避免 admin 登录后无菜单/路由权限。
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


async def _clear_menu_cache():
    """迁移完成后清除菜单树与用户权限缓存，避免返回旧数据"""
    try:
        import redis.asyncio as redis
        from app.core.config import settings
        from app.core.cache import CACHE_KEY_PREFIXES
        client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD or None,
            db=settings.REDIS_DB,
            decode_responses=True,
        )
        count = 0
        async for key in client.scan_iter(match=f"{CACHE_KEY_PREFIXES['menu_tree']}*"):
            await client.delete(key)
            count += 1
        async for key in client.scan_iter(match=f"{CACHE_KEY_PREFIXES['user_perm']}*"):
            await client.delete(key)
            count += 1
        await client.aclose()
        if count > 0:
            print(f"[RBAC] 已清除菜单/权限缓存 {count} 条")
    except Exception as e:
        print(f"[RBAC] 清除缓存失败（可忽略）: {e}")


async def main():
    from app.core.migration_config import MIGRATIONS
    from app.core.migration_version import needs_migration, write_applied_version

    migration_need, migration_cur, applied = needs_migration()
    if not migration_need:
        return

    for mod_name, fn_name in MIGRATIONS:
        mod = __import__(f"scripts.{mod_name}", fromlist=[fn_name])
        fn = getattr(mod, fn_name)
        await fn()
    write_applied_version(migration_cur)
    await _clear_menu_cache()
    print(f"[RBAC] 迁移已执行完成，版本: {migration_cur}")


if __name__ == "__main__":
    asyncio.run(main())
