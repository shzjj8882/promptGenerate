"use client";

import React, { ReactNode, useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Building2,
  BookOpenText,
  MessageSquareText,
  PanelLeft,
  Sparkles,
  LogOut,
  Shield,
  Menu,
  ChevronLeft,
  Settings2,
  Check,
} from "lucide-react";
import { observer } from "mobx-react-lite";
import { uiStore } from "@/store/ui-store";
import { dashboardStore } from "@/store/dashboard-store";
import { userStore } from "@/store/user-store";
import { logout, getCurrentUser } from "@/lib/api/auth";
import { getAuthToken } from "@/lib/api/config";
import { logger } from "@/lib/utils/logger";
import { getMenuTree, MenuItem } from "@/lib/api/rbac";
import { getMenuHref, MENU_CODE_TO_HREF } from "@/lib/menu-config";
import { DashboardConfigPanel } from "./components/dashboard-config-panel/DashboardConfigPanel";

/** 路径 -> 所需菜单权限 code（或 "superuser" 表示仅超管可访问，"team_admin" 表示团队管理员或超管可访问），用于路由守卫 */
const PATH_TO_MENU_CODE: Record<string, string> = {
  "/dashboard/tenants": "menu:tenant:list",
  "/dashboard/prompts": "menu:prompts:list",
  "/dashboard/compositions": "menu:compositions:list",
  "/dashboard/teams": "menu:teams:list",
  "/dashboard/rbac": "team_admin", // 保留旧路径的兼容性
  "/dashboard/rbac/roles": "menu:rbac:roles:list",
  "/dashboard/rbac/user-roles": "menu:rbac:user_roles:list",
  "/dashboard/rbac/menus": "menu:rbac:menus:list",
  // 配置中心子路径：按具体菜单权限校验（支持普通用户通过角色访问）
  "/dashboard/config/scenes": "menu:config:scenes",
  "/dashboard/config/placeholders": "menu:config:placeholders",
  "/dashboard/config/tables": "menu:config:tables",
  "/dashboard/config/models": "team_admin", // 模型管理接口需团队管理员或超管，与后端 require_team_admin_or_superuser 一致
  "/dashboard/config/menus": "menu:config:menus",
  "/dashboard/config/mcp": "menu:config:mcp",
  "/dashboard/config/notification": "menu:config:notification",
  "/dashboard/config": "config_any", // 配置中心根路径（redirect 到 scenes），需有任一配置相关权限
  "/dashboard/tables": "menu:tables:list",
};

function getRequiredMenuCode(pathname: string): string | null {
  for (const [prefix, code] of Object.entries(PATH_TO_MENU_CODE)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return code;
  }
  return null;
}

const CONFIG_MENU_CODES = ["menu:config", "menu:config:scenes", "menu:config:placeholders", "menu:config:tables", "menu:config:models", "menu:config:menus", "menu:config:mcp", "menu:config:notification"];

function userHasMenuCode(user: { is_superuser?: boolean; is_team_admin?: boolean; menu_permission_codes?: string[] } | null, code: string): boolean {
  if (!user) return false;
  if (code === "superuser") return user.is_superuser === true;
  if (code === "team_admin") return user.is_superuser === true || user.is_team_admin === true;
  // 配置中心任一子权限（/dashboard/config 根路径 redirect 到 scenes，需有任一配置权限即可）
  if (code === "config_any") {
    if (user.is_superuser) return false;
    if (user.is_team_admin) return true;
    return CONFIG_MENU_CODES.some((c) => user.menu_permission_codes?.includes(c));
  }
  
  // 团队管理菜单（menu:team* 或 menu:teams*）仅系统管理员可见
  if (code.startsWith("menu:team") || code.startsWith("menu:teams")) {
    return user.is_superuser === true;
  }
  
  // 系统超级管理员：只能看到团队管理菜单（已在上面处理）
  if (user.is_superuser) return false;
  
  // 团队管理员：拥有除团队管理菜单外的所有菜单权限
  if (user.is_team_admin) return true;
  
  // 普通用户：只能看到通过角色分配的菜单权限
  return !!user.menu_permission_codes?.includes(code);
}

import { DashboardNav } from "@/components/shared/dashboard-nav";

// 避免在开发模式下 React StrictMode 导致 /me 请求触发两次
let didFetchCurrentUser = false;

// 缓存排序后的菜单映射（避免每次排序）
let cachedHrefEntries: Array<[string, string]> | null = null;
let cachedPathEntries: Array<[string, string]> | null = null;

/**
 * 根据路径找到对应的菜单 code（优化：使用缓存的排序结果）
 */
function getMenuCodeFromPath(pathname: string): string | null {
  // 优先反向查找 MENU_CODE_TO_HREF（更精确的匹配）
  // 按路径长度降序排序，优先匹配更长的路径（更具体的路径）
  if (!cachedHrefEntries) {
    cachedHrefEntries = Object.entries(MENU_CODE_TO_HREF).sort((a, b) => b[1].length - a[1].length);
  }
  for (const [code, href] of cachedHrefEntries) {
    if (pathname === href || pathname.startsWith(href + "/")) {
      return code;
    }
  }
  
  // 如果没找到，尝试通过 PATH_TO_MENU_CODE 查找（排除特殊权限）
  // 同样按路径长度降序排序
  if (!cachedPathEntries) {
    cachedPathEntries = Object.entries(PATH_TO_MENU_CODE).sort((a, b) => b[0].length - a[0].length);
  }
  for (const [prefix, code] of cachedPathEntries) {
    if ((pathname === prefix || pathname.startsWith(prefix + "/")) && 
        code !== "superuser" && code !== "team_admin") {
      return code;
    }
  }
  
  return null;
}

// 缓存菜单项映射，避免重复构建
let cachedMenuTree: MenuItem[] | null = null;
let cachedMenuItemMap: Map<string, MenuItem> | null = null; // ID -> MenuItem
let cachedCodeMap: Map<string, MenuItem> | null = null; // code -> MenuItem

/**
 * 构建并缓存菜单项的所有映射（ID 和 code）
 */
function buildAndCacheMaps(menuTree: MenuItem[]) {
  // 如果菜单树没有变化，直接返回
  if (cachedMenuTree === menuTree && cachedMenuItemMap && cachedCodeMap) {
    return;
  }
  
  // 重新构建映射
  cachedMenuTree = menuTree;
  cachedMenuItemMap = new Map<string, MenuItem>();
  cachedCodeMap = new Map<string, MenuItem>();
  
  function traverse(items: MenuItem[]) {
    for (const item of items) {
      cachedMenuItemMap!.set(item.id, item);
      cachedCodeMap!.set(item.code, item);
      if (item.children && item.children.length > 0) {
        traverse(item.children);
      }
    }
  }
  
  traverse(menuTree);
}

/**
 * 获取菜单项 ID 映射（带缓存）
 */
function getMenuItemMap(menuTree: MenuItem[]): Map<string, MenuItem> {
  buildAndCacheMaps(menuTree);
  return cachedMenuItemMap!;
}

/**
 * 获取菜单项 code 映射（带缓存）
 */
function getMenuItemCodeMap(menuTree: MenuItem[]): Map<string, MenuItem> {
  buildAndCacheMaps(menuTree);
  return cachedCodeMap!;
}

/**
 * 在菜单树中查找指定 code 的菜单项（优化：使用 Map 索引）
 */
function findMenuItemByCode(menuTree: MenuItem[], code: string): MenuItem | null {
  const codeMap = getMenuItemCodeMap(menuTree);
  return codeMap.get(code) || null;
}

/**
 * 构建菜单项的完整路径（从根到当前节点）
 * 优化：使用 Map 索引，避免重复遍历菜单树
 */
function buildMenuPath(menuTree: MenuItem[], targetCode: string): MenuItem[] {
  const targetItem = findMenuItemByCode(menuTree, targetCode);
  if (!targetItem) return [];
  
  // 获取缓存的菜单项映射
  const itemMap = getMenuItemMap(menuTree);
  
  const path: MenuItem[] = [];
  let current: MenuItem | null = targetItem;
  
  // 向上遍历父节点（使用 Map 快速查找）
  while (current) {
    path.unshift(current);
    if (current.parent_id) {
      // 通过 Map 快速查找父节点（O(1) 时间复杂度）
      current = itemMap.get(current.parent_id) || null;
    } else {
      current = null;
    }
  }
  
  return path;
}

/**
 * 根据路径和菜单树动态生成路由元信息（标题和面包屑）
 */
function getRouteMeta(pathname: string, menuTree: MenuItem[]): {
  title: string;
  crumbs: Array<{ label: string; href?: string }>;
} {
  // 首页
  if (pathname === "/dashboard") {
    return {
      title: "工作台",
      crumbs: [{ label: "工作台" }],
    };
  }
  
  // 特殊路由（不在菜单树中的）
  if (pathname.startsWith("/dashboard/teams")) {
    return {
      title: "团队管理",
      crumbs: [
        { label: "工作台", href: "/dashboard" },
        { label: "团队管理" },
      ],
    };
  }
  
  // 配置中心子路由处理
  if (pathname.startsWith("/dashboard/config")) {
    const configSubRoutes: Record<string, { name: string; code: string }> = {
      "/dashboard/config/scenes": { name: "场景配置", code: "menu:config:scenes" },
      "/dashboard/config/placeholders": { name: "占位符配置", code: "menu:config:placeholders" },
      "/dashboard/config/tables": { name: "表格配置", code: "menu:config:tables" },
      "/dashboard/config/models": { name: "模型管理", code: "menu:config:models" },
      "/dashboard/config/menus": { name: "菜单配置", code: "menu:config:menus" },
      "/dashboard/config/mcp": { name: "MCP 配置", code: "menu:config:mcp" },
      "/dashboard/config/notification": { name: "通知中心", code: "menu:config:notification" },
    };
    
    // 精确匹配子路由
    for (const [route, info] of Object.entries(configSubRoutes)) {
      if (pathname === route || pathname.startsWith(route + "/")) {
        const menuCode = info.code;
        if (menuTree.length > 0) {
          const menuPath = buildMenuPath(menuTree, menuCode);
          if (menuPath.length > 0) {
            const crumbs: Array<{ label: string; href?: string }> = [
              { label: "工作台", href: "/dashboard" },
            ];
            menuPath.forEach((item, index) => {
              const href = getMenuHref(item.code);
              if (index === menuPath.length - 1) {
                crumbs.push({ label: item.name });
              } else {
                crumbs.push({ label: item.name, href });
              }
            });
            return {
              title: menuPath[menuPath.length - 1].name,
              crumbs,
            };
          }
        }
        // 如果菜单树还没加载，使用默认值
        return {
          title: info.name,
          crumbs: [
            { label: "工作台", href: "/dashboard" },
            { label: "配置中心", href: "/dashboard/config/scenes" },
            { label: info.name },
          ],
        };
      }
    }
    
    // 配置中心根路径
    return {
      title: "配置中心",
      crumbs: [
        { label: "工作台", href: "/dashboard" },
        { label: "配置中心" },
      ],
    };
  }
  
  // 组合页
  if (pathname.startsWith("/dashboard/compositions")) {
    return {
      title: "组合",
      crumbs: [
        { label: "工作台", href: "/dashboard" },
        { label: "组合" },
      ],
    };
  }

  // 处理动态路由：/dashboard/tables/[id] - 表格详情页
  const tablesDetailMatch = pathname.match(/^\/dashboard\/tables\/([^/]+)$/);
  if (tablesDetailMatch) {
    const menuCode = "menu:tables:list";
    const menuItem = findMenuItemByCode(menuTree, menuCode);
    if (menuItem) {
      return {
        title: "详情",
        crumbs: [
          { label: "工作台", href: "/dashboard" },
          { label: menuItem.name, href: "/dashboard/tables" },
          { label: "详情" },
        ],
      };
    }
    // 如果菜单树还没加载，使用默认值
    return {
      title: "详情",
      crumbs: [
        { label: "工作台", href: "/dashboard" },
        { label: "多维表格", href: "/dashboard/tables" },
        { label: "详情" },
      ],
    };
  }
  
  // 尝试从菜单树中查找
  const menuCode = getMenuCodeFromPath(pathname);
  if (menuCode) {
    if (menuTree.length > 0) {
      const menuPath = buildMenuPath(menuTree, menuCode);
      if (menuPath.length > 0) {
        const crumbs: Array<{ label: string; href?: string }> = [
          { label: "工作台", href: "/dashboard" },
        ];
        
        // 添加菜单路径中的每一项
        menuPath.forEach((item, index) => {
          const href = getMenuHref(item.code);
          if (index === menuPath.length - 1) {
            // 最后一项不添加链接
            crumbs.push({ label: item.name });
          } else {
            crumbs.push({ label: item.name, href });
          }
        });
        
        return {
          title: menuPath[menuPath.length - 1].name,
          crumbs,
        };
      }
    }
    
    // 如果菜单树还没加载，但找到了菜单 code，使用菜单配置中的信息
    const menuHref = MENU_CODE_TO_HREF[menuCode];
    if (menuHref) {
      // 从菜单 code 推断菜单名称（简单映射）
      const menuNameMap: Record<string, string> = {
        "menu:tenant:list": "租户管理",
        "menu:prompts:list": "提示词管理",
        "menu:compositions:list": "组合",
        "menu:rbac": "权限管理",
        "menu:config": "配置中心",
        "menu:config:scenes": "场景配置",
        "menu:config:placeholders": "占位符配置",
        "menu:config:tables": "表格配置",
        "menu:tables:list": "多维表格",
      };
      const menuName = menuNameMap[menuCode] || "未知菜单";
      
      return {
        title: menuName,
        crumbs: [
          { label: "工作台", href: "/dashboard" },
          { label: menuName },
        ],
      };
    }
  }
  
  // 默认返回
  return {
    title: "工作台",
    crumbs: [{ label: "工作台", href: "/dashboard" }],
  };
}

function DashboardLayoutImpl({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = uiStore.sidebarCollapsed;
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // 直接使用 store 中的菜单树，而不是本地状态
  const menuTree = userStore.menuTree;
  
  // 根据菜单树动态生成路由元信息（使用 useMemo 优化性能）
  const meta = useMemo(() => getRouteMeta(pathname, menuTree), [pathname, menuTree]);

  const requiredMenuCode = getRequiredMenuCode(pathname);
  const canAccessCurrentRoute =
    requiredMenuCode == null ||
    (!!token && userStore.user !== null && userHasMenuCode(userStore.user, requiredMenuCode));

  // 标记组件已在客户端挂载，并读取 token（避免 SSR 与首帧因 window/token 不同导致 hydration 不匹配）
  useEffect(() => {
    setMounted(true);
    setToken(getAuthToken());
  }, []);

  // 移动端：路由切换时关闭菜单
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // 离开 /dashboard 时退出配置模式
  useEffect(() => {
    if (pathname !== "/dashboard") {
      uiStore.exitDashboardConfig();
    }
  }, [pathname]);

  // 页面加载/刷新时：并行请求用户信息和菜单树（优化首次加载速度）
  // 注意：didFetchCurrentUser 必须在确认有 token 后再置 true，否则用户从未登录→登录后首次进入 dashboard 时
  // 会因之前无 token 时已置 true 而跳过请求，导致菜单为空（刷新后模块重载才恢复）
  useEffect(() => {
    if (didFetchCurrentUser) return;
    const t = getAuthToken();
    if (!t) return;

    didFetchCurrentUser = true;
    
    // 并行执行用户信息和菜单树查询，提升首次加载速度
    const fetchUserInfo = getCurrentUser()
      .then((userInfo) => {
        userStore.setUser(userInfo);
      })
      .catch((err) => {
        logger.error("获取用户信息失败", err);
        if (typeof window !== "undefined") {
          logout();
        }
      });
    
    // 菜单树查询不依赖 userStore.user，只要有 token 就可以执行（后端会从 JWT 解析 user_id）
    // 如果 store 中已有菜单树，不需要重复请求
    const fetchMenuTree = userStore.menuTree.length > 0 || userStore.menuTreeLoading
      ? Promise.resolve()
      : (() => {
          userStore.setMenuTreeLoading(true);
          return getMenuTree()
            .then((tree) => {
              // 后端已经返回了用户有权限的菜单，直接存储到 store
              userStore.setMenuTree(tree);
            })
            .catch((err) => {
              logger.error("获取菜单树失败", err);
              userStore.setMenuTree([]);
            })
            .finally(() => {
              userStore.setMenuTreeLoading(false);
            });
        })();
    
    // 并行执行，不等待
    Promise.all([fetchUserInfo, fetchMenuTree]).catch((err) => {
      logger.error("初始化数据加载失败", err);
    });
  }, []);

  // 路由级保护：当前路径需要菜单权限时，无权限则重定向
  // 使用 getAuthToken() 而非 token state：刷新时 token 初始为 null，要等下一帧才被 setToken 更新，若用 state 会误判为未登录并跳到登录页
  useEffect(() => {
    const code = getRequiredMenuCode(pathname);
    if (code == null) return;
    const currentToken = getAuthToken();
    if (!currentToken) {
      router.replace("/login");
      return;
    }
    // 确保 user 对象存在且稳定
    const user = userStore.user;
    if (user !== null && !userHasMenuCode(user, code)) {
      router.replace("/403");
    }
  }, [pathname, token, userStore.user?.id || null]);

  const handleLogout = () => {
    logout();
  };

  // 获取用户名称的首字母
  const getUserInitials = (name: string): string => {
    if (!name) return "用户";
    // 处理中文：取第一个字符
    const firstChar = name[0];
    // 如果是中文字符（Unicode范围）
    if (/[\u4e00-\u9fa5]/.test(firstChar)) {
      return firstChar;
    }
    // 如果是英文：取首字母并转为大写
    const words = name.trim().split(/\s+/);
    if (words.length > 0) {
      return words[0][0].toUpperCase();
    }
    return firstChar.toUpperCase();
  };

  return (
    <div 
      className="flex min-h-screen bg-background text-foreground"
      style={{ contain: "layout style paint" }}
    >
      {/* 左侧菜单（移动端隐藏，改由 Sheet 展示） */}
      <aside
        className={cn(
          "hidden sm:flex flex-col border-r border-zinc-800 bg-black text-zinc-50 transition-all duration-200 h-screen overflow-hidden",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* 顶部 logo 和折叠按钮 */}
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-zinc-100" />
            {!collapsed && (
              <span className="text-sm font-semibold tracking-tight">
                PromptHub 工作台
              </span>
            )}
          </div>
        </div>

        {/* 导航菜单：dynamic(ssr:false) 仅客户端渲染，服务端与首帧统一占位，避免 hydration 不匹配 */}
        <DashboardNav />
      </aside>

      {/* 右侧内容区域 + 配置侧边栏（整体屏幕） */}
      <div className="flex flex-1 min-w-0 h-screen overflow-hidden">
        {/* 主内容区：工作台首页特殊处理（内容直接在最外层），其他页面用 header + main */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Header（工作台首页也保留，保持一致性） */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
          <div className="flex items-center gap-3">
            {/* 移动端：汉堡菜单 */}
            <button
              type="button"
              aria-label="打开菜单"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground sm:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* PC 端：侧边栏折叠按钮 */}
            <button
              type="button"
              aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
              onClick={() => uiStore.toggleSidebar()}
              className="hidden h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground sm:inline-flex"
            >
              <PanelLeft
                className={cn(
                  "h-4 w-4 transition-transform",
                  collapsed ? "rotate-180" : "rotate-0"
                )}
              />
            </button>
            <h1 className="text-base font-semibold truncate sm:text-lg">{meta.title}</h1>
          </div>
          <div className="flex items-center gap-4">
            {pathname === "/dashboard" && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (uiStore.dashboardConfigMode) {
                    try {
                      await dashboardStore.saveConfig();
                      uiStore.toggleDashboardConfig();
                    } catch {
                      // 保存失败时留在配置模式，错误已由 store 记录
                    }
                  } else {
                    uiStore.toggleDashboardConfig();
                  }
                }}
                className={cn("gap-2", uiStore.dashboardConfigMode && "bg-muted")}
              >
                {uiStore.dashboardConfigMode ? (
                  <>
                    <Check className="h-4 w-4" />
                    完成
                  </>
                ) : (
                  <>
                    <Settings2 className="h-4 w-4" />
                    配置
                  </>
                )}
              </Button>
            )}
            <ThemeToggle />
            {mounted && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-ring">
                    <Avatar>
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {userStore.user ? getUserInitials(userStore.displayName) : "用户"}
                      </AvatarFallback>
                    </Avatar>
                    {userStore.user && (
                      <span className="text-sm font-medium hidden sm:inline-block">
                        {userStore.displayName}
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {userStore.user && (
                    <>
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        <div className="font-medium">{userStore.displayName}</div>
                        <div className="text-xs">{userStore.user.email}</div>
                      </div>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem>个人设置</DropdownMenuItem>
                  <DropdownMenuItem>账户管理</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>退出登录</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!mounted && (
              <div className="flex items-center gap-2 rounded-full">
                <Avatar>
                  <AvatarFallback className="bg-primary/10 text-primary">用户</AvatarFallback>
                </Avatar>
              </div>
            )}
          </div>
        </header>

        {/* 移动端：左侧滑出菜单 */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent
            side="left"
            className="flex flex-col gap-0 border-r border-zinc-800 bg-black p-0 text-zinc-50 w-[280px] max-w-[85vw] rounded-none [&>button]:text-zinc-400 [&>button]:hover:text-zinc-50 [&>button]:right-4 [&>button]:top-4"
          >
            <SheetHeader className="flex flex-row items-center gap-2 border-b border-zinc-800 px-4 py-4">
              <Sparkles className="h-5 w-5 text-zinc-100" />
              <SheetTitle className="text-base font-semibold tracking-tight text-zinc-50">
                PromptHub 工作台
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto py-4">
              <DashboardNav collapsedOverride={false} />
            </div>
          </SheetContent>
        </Sheet>

        {/* 工作台首页：内容直接在最外层，背景和边距与 main 一致，允许滚动 */}
        {pathname === "/dashboard" ? (
          <div className="flex flex-1 flex-col min-w-0 overflow-y-auto overflow-x-hidden bg-muted/30 p-4 dark:bg-background custom-scrollbar">
            {requiredMenuCode != null && !canAccessCurrentRoute ? (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                {token && userStore.user === null ? "加载中..." : "正在跳转..."}
              </div>
            ) : (
              children
            )}
          </div>
        ) : (
          /* 其他页面：main + 面包屑 + card 包裹 */
          <main className="flex flex-1 flex-col min-h-0 overflow-hidden bg-muted/30 p-4 dark:bg-background">
            <div className="mb-4 hidden sm:block shrink-0">
              <Breadcrumb>
                <BreadcrumbList>
                  {meta.crumbs.map((c, idx) => {
                    const isLast = idx === meta.crumbs.length - 1;
                    return (
                      <React.Fragment key={idx}>
                        <BreadcrumbItem>
                          {isLast || !c.href ? (
                            <BreadcrumbPage>{c.label}</BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink asChild>
                              <Link href={c.href}>{c.label}</Link>
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                        {!isLast && <BreadcrumbSeparator />}
                      </React.Fragment>
                    );
                  })}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className={cn(
              "flex flex-1 flex-col min-h-0 rounded-lg bg-card border border-border p-6 shadow-md w-full",
              pathname && /^\/dashboard\/tables\/[^/]+/.test(pathname)
                ? "overflow-hidden"
                : "overflow-auto custom-scrollbar"
            )}>
              {requiredMenuCode != null && !canAccessCurrentRoute ? (
                <div className="flex flex-1 items-center justify-center text-muted-foreground">
                  {token && userStore.user === null ? "加载中..." : "正在跳转..."}
                </div>
              ) : (
                children
              )}
            </div>
          </main>
        )}
        </div>

        {/* 配置侧边栏（仅 /dashboard 首页配置中且侧边栏展开时） */}
        {pathname === "/dashboard" && uiStore.dashboardConfigMode && uiStore.dashboardConfigSidebarOpen && (
          <DashboardConfigPanel
            onCollapse={() => uiStore.setDashboardConfigSidebarOpen(false)}
          />
        )}
        {/* 配置中但侧边栏折叠时：显示展开按钮条 */}
        {pathname === "/dashboard" && uiStore.dashboardConfigMode && !uiStore.dashboardConfigSidebarOpen && (
          <button
            type="button"
            onClick={() => uiStore.setDashboardConfigSidebarOpen(true)}
            className="w-10 shrink-0 h-full flex flex-col items-center justify-center gap-0.5 border-l border-zinc-700 bg-zinc-900 hover:bg-zinc-800 transition-colors shadow-[-4px_0_8px_rgba(0,0,0,0.2)]"
            title="展开侧边栏"
          >
            <ChevronLeft className="h-4 w-4 text-zinc-300" />
            <span className="text-[10px] text-zinc-300">展开</span>
          </button>
        )}
      </div>
    </div>
  );
}

const DashboardLayout = observer(DashboardLayoutImpl);

export default DashboardLayout;



