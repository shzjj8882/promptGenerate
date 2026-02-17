#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
验证启动时执行的 RBAC/菜单 迁移脚本能否全部成功（幂等、可重复执行）
用法: cd service && PYTHONPATH=. python scripts/verify_startup_migrations.py
"""
import asyncio
import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))


async def main():
    from app.core.migration_config import MIGRATIONS
    from app.core.migration_version import needs_migration, write_applied_version

    # 版本一致则跳过，main 启动时也不会执行
    need, cur, _ = needs_migration()
    if not need:
        print("迁移版本已是最新，跳过预检查")
        return

    errors = []
    for mod_name, fn_name in MIGRATIONS:
        try:
            mod = __import__(f"scripts.{mod_name}", fromlist=[fn_name])
            fn = getattr(mod, fn_name)
            await fn()
            print(f"✅ {mod_name}.{fn_name}() 成功")
        except Exception as e:
            print(f"❌ {mod_name}.{fn_name}() 失败: {e}")
            errors.append((mod_name, str(e)))
    if errors:
        print(f"\n共 {len(errors)} 个脚本失败")
        sys.exit(1)
    write_applied_version(cur)
    print("\n✅ 所有启动迁移脚本验证通过")


if __name__ == "__main__":
    asyncio.run(main())
