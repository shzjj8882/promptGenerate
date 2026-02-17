# -*- coding: utf-8 -*-
"""
RBAC/菜单 迁移脚本配置

- 集中维护迁移列表及执行顺序
- 新增迁移时在此追加，版本会自动变化
"""
from typing import List, Tuple

# 迁移列表：(模块名, 函数名)，顺序敏感
MIGRATIONS: List[Tuple[str, str]] = [
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
    ("migrate_add_notification_configs", "migrate"),
    ("migrate_add_llmchat_tasks", "migrate"),
    ("migrate_add_notification_menu", "migrate"),
    ("migrate_add_notification_api_permissions", "migrate"),
    ("migrate_add_notification_menu_config", "migrate"),
]
