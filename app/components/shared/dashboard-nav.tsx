"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronRight, Users } from "lucide-react";
import { observer } from "mobx-react-lite";
import { uiStore } from "@/store/ui-store";
import { userStore } from "@/store/user-store";
import { getMenuTree, MenuItem } from "@/lib/api/rbac";
import { getMenuHref, getMenuIcon } from "@/lib/menu-config";

function userHasMenuCode(user: { is_superuser?: boolean; is_team_admin?: boolean; menu_permission_codes?: string[] } | null, code: string): boolean {
  if (!user) return false;
  
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

/** 菜单项组件（支持二级菜单折叠） */
const MenuItemComponent = ({ item, pathname, collapsed, level = 0 }: { 
  item: MenuItem; 
  pathname: string; 
  collapsed: boolean;
  level?: number;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = item.children && item.children.length > 0;
  const href = getMenuHref(item.code);
  const Icon = getMenuIcon(item.code);
  const isActive = pathname === href || pathname.startsWith(href + "/");
  
  // 检查是否有子菜单项是激活的
  const hasActiveChild = hasChildren && item.children!.some(child => {
    const childHref = getMenuHref(child.code);
    return pathname === childHref || pathname.startsWith(childHref + "/");
  });
  
  // 如果有激活的子菜单，自动展开
  useEffect(() => {
    if (hasActiveChild) {
      setIsExpanded(true);
    }
  }, [hasActiveChild]);

  if (hasChildren) {
    // 有子菜单的父菜单项
    const firstChildHref = item.children && item.children.length > 0 
      ? getMenuHref(item.children[0].code) 
      : href;
    
    return (
      <div>
        <Link
          href={firstChildHref}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs transition-colors",
            (isActive || hasActiveChild) 
              ? "bg-zinc-800 text-zinc-50" 
              : "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50"
          )}
          onClick={(e) => {
            // 如果点击的是展开/收起图标区域，则切换展开状态
            const target = e.target as HTMLElement;
            if (target.closest('.chevron-icon') || target.classList.contains('chevron-icon')) {
              e.preventDefault();
              setIsExpanded(!isExpanded);
            }
          }}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left">{item.name}</span>
              <ChevronRight 
                className={cn(
                  "h-3 w-3 shrink-0 transition-transform chevron-icon",
                  isExpanded && "rotate-90"
                )}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
              />
            </>
          )}
        </Link>
        {!collapsed && isExpanded && (
          <div className="ml-4 mt-1 space-y-1 border-l border-zinc-700 pl-2">
            {item.children!.map((child) => (
              <MenuItemComponent
                key={child.id}
                item={child}
                pathname={pathname}
                collapsed={collapsed}
                level={level + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 普通菜单项（无子菜单）
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-xs transition-colors",
        level > 0 && "ml-4",
        isActive 
          ? "bg-zinc-800 text-zinc-50" 
          : "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50"
      )}
    >
      {level === 0 && <Icon className="h-4 w-4 shrink-0" />}
      {!collapsed && <span className="truncate">{item.name}</span>}
    </Link>
  );
};

/** 按后端接口权限过滤菜单：模型管理需 team_admin；团队认证为按钮非菜单，过滤 menu:config:team_auth */
function filterMenuTreeByBackendPermission(
  items: MenuItem[],
  user: { is_superuser?: boolean; is_team_admin?: boolean } | null
): MenuItem[] {
  return items
    .filter((item) => item.code !== "menu:config:team_auth") // 团队认证是按钮权限，非菜单
    .filter((item) => {
      if (item.code === "menu:config:models" && (!user || !user.is_superuser && !user.is_team_admin))
        return false; // 模型管理需 team_admin
      return true;
    })
    .map((item) => {
      if (item.children?.length) {
        const filtered = filterMenuTreeByBackendPermission(item.children, user);
        return { ...item, children: filtered };
      }
      return item;
    });
}

interface DashboardNavProps {
  /** 移动端菜单强制展开（覆盖 sidebarCollapsed） */
  collapsedOverride?: boolean;
}

/** 仅客户端渲染的侧栏导航，由 layout 通过 dynamic(ssr:false) 引入，避免 hydration 不匹配 */
const DashboardNavImpl = ({ collapsedOverride }: DashboardNavProps = {}) => {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const collapsed = collapsedOverride ?? uiStore.sidebarCollapsed;
  // 直接从 store 读取菜单树（MobX 会自动响应式更新）
  const rawMenuTree = userStore.menuTree;
  const menuTree = filterMenuTreeByBackendPermission(rawMenuTree, userStore.user);
  const loading = userStore.menuTreeLoading || (!userStore.user && rawMenuTree.length === 0);

  useEffect(() => setMounted(true), []);

  // 挂载前统一渲染占位，避免服务端与客户端 store 状态不同导致 hydration 不匹配
  if (!mounted) {
    return (
      <nav className="mt-2 space-y-1 px-2 text-sm" aria-label="主导航">
        <div className="px-3 py-2 text-xs text-zinc-400">加载中...</div>
      </nav>
    );
  }

  if (loading) {
    return (
      <nav className="mt-2 space-y-1 px-2 text-sm" aria-label="主导航">
        <div className="px-3 py-2 text-xs text-zinc-400">加载中...</div>
      </nav>
    );
  }

  if (menuTree.length === 0) {
    return (
      <nav className="mt-2 space-y-1 px-2 text-sm" aria-label="主导航">
        <div className="px-3 py-2 text-xs text-zinc-400">暂无菜单</div>
      </nav>
    );
  }

  return (
    <nav className="mt-2 space-y-1 px-2 text-sm" aria-label="主导航">
      {menuTree.map((item) => (
        <MenuItemComponent
          key={item.id}
          item={item}
          pathname={pathname}
          collapsed={collapsed}
        />
      ))}
    </nav>
  );
};

export const DashboardNav = observer(DashboardNavImpl);
