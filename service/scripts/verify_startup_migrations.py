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
    errors = []
    scripts = [
        ("migrate_rbac", "migrate"),
        ("migrate_permission_menu_type", "migrate"),
        ("migrate_permission_config_fields", "migrate"),
        ("migrate_add_config_menu", "migrate"),
        ("migrate_add_models_menu", "migrate"),
        ("migrate_add_tables_menu", "migrate"),
        ("migrate_add_tables_menu_button_permissions", "migrate"),
        ("migrate_add_team_menu", "migrate"),
        ("migrate_add_rbac_submenus", "migrate"),
        ("migrate_api_permissions", "migrate"),
        ("migrate_add_tables_api_permissions", "migrate"),
        ("migrate_add_reset_authcode_permission", "migrate"),
        ("migrate_remove_team_auth_menu", "migrate"),
        ("migrate_add_mcp_menu", "migrate"),
        ("migrate_add_mcp_api_permissions", "migrate"),
        ("migrate_add_mcp_transport_type", "migrate"),
    ]
    for mod_name, fn_name in scripts:
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
    print("\n✅ 所有启动迁移脚本验证通过")


if __name__ == "__main__":
    asyncio.run(main())
