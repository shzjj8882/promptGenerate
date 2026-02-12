/**
 * 菜单配置：菜单 code 到路径和图标的映射
 */
import { Building2, BookOpenText, MessageSquareText, Shield, Users, Settings, Layers, FileText, Table, UserCog, Menu, Cpu, Plug, Mail } from "lucide-react";
import { LucideIcon } from "lucide-react";

/**
 * 菜单 code 到路径的映射
 */
export const MENU_CODE_TO_HREF: Record<string, string> = {
  "menu:tenant:list": "/dashboard/tenants",
  "menu:prompts:list": "/dashboard/prompts",
  "menu:rbac": "/dashboard/rbac/roles", // 权限管理父菜单默认跳转到角色管理
  "menu:rbac:roles:list": "/dashboard/rbac/roles",
  "menu:rbac:user_roles:list": "/dashboard/rbac/user-roles",
  "menu:rbac:menus:list": "/dashboard/rbac/menus",
  "menu:config": "/dashboard/config/scenes", // 配置中心父菜单默认跳转到场景配置
  "menu:config:scenes": "/dashboard/config/scenes",
  "menu:config:placeholders": "/dashboard/config/placeholders",
  "menu:config:tables": "/dashboard/config/tables",
  "menu:config:models": "/dashboard/config/models", // 模型管理菜单
  "menu:config:mcp": "/dashboard/config/mcp", // MCP 配置菜单
  "menu:config:notification": "/dashboard/config/notification", // 通知中心
  "menu:tables:list": "/dashboard/tables", // 独立的多维表格菜单
  "menu:teams:list": "/dashboard/teams", // 团队管理菜单（仅系统管理员可见）
};

/**
 * 菜单 code 到图标的映射
 */
export const MENU_CODE_TO_ICON: Record<string, LucideIcon> = {
  "menu:tenant:list": Building2,
  "menu:teams:list": Users,
  "menu:prompts:list": MessageSquareText,
  "menu:rbac": Shield,
  "menu:rbac:roles:list": Users,
  "menu:rbac:user_roles:list": UserCog,
  "menu:rbac:menus:list": Menu,
  "menu:config": Settings,
  "menu:config:scenes": Layers,
  "menu:config:placeholders": FileText,
  "menu:config:tables": Table,
  "menu:config:models": Cpu,
  "menu:config:mcp": Plug,
  "menu:config:notification": Mail,
  "menu:tables:list": Table,
};

/**
 * 默认图标（当找不到对应图标时使用）
 */
export const DEFAULT_MENU_ICON = Settings;

/**
 * 根据菜单 code 获取路径
 */
export function getMenuHref(code: string): string {
  return MENU_CODE_TO_HREF[code] || "#";
}

/**
 * 根据菜单 code 获取图标
 */
export function getMenuIcon(code: string): LucideIcon {
  return MENU_CODE_TO_ICON[code] || DEFAULT_MENU_ICON;
}
