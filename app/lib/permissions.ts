"use client";

import { userStore } from "@/store/user-store";

/**
 * 权限结构：菜单权限（细分为路由权限 + 按钮权限，控制前端展示）+ 接口权限（暂不强制校验）。
 * 菜单按钮权限：在「角色管理 → 权限分配 → 菜单 → 按钮权限」中勾选，/me 返回 menu_permission_codes，前端据此控制新建/编辑/删除等按钮显隐。
 */
export const MENU_BUTTON_PERMISSIONS = {
  tenant: { create: "menu:tenant:create", update: "menu:tenant:update", delete: "menu:tenant:delete" },
  prompts: { create: "menu:prompts:create", update: "menu:prompts:update", delete: "menu:prompts:delete" },
  scenes: { create: "menu:scenes:create", update: "menu:scenes:update", delete: "menu:scenes:delete" },
  role: { create: "menu:rbac:role:create", update: "menu:rbac:role:update", delete: "menu:rbac:role:delete" },
  userRole: { assign: "menu:rbac:user_role:assign" },
  tables: { create: "menu:tables:create", update: "menu:tables:update", delete: "menu:tables:delete" },
} as const;

/**
 * 页面按钮权限统计（接口权限 code，用于接口级控制，与菜单按钮权限并行）
 * | 页面       | 按钮/操作     | 接口 code      | 菜单 code（显隐由菜单权限控制） |
 * |------------|----------------|----------------|--------------------------------|
 * | 租户管理   | 新建/编辑/删除 | tenant:create 等 | menu:tenant:create 等           |
 */
export const BUTTON_PERMISSIONS = {
  /** 租户管理 */
  tenant: {
    create: "tenant:create",
    update: "tenant:update",
    delete: "tenant:delete",
  },
  /** 提示词管理 */
  prompts: {
    create: "prompts:create",
    update: "prompts:update",
    delete: "prompts:delete",
  },
  /** 场景管理 */
  scenes: {
    create: "scenes:create",
    update: "scenes:update",
    delete: "scenes:delete",
  },
  /** 权限管理 - 角色 */
  role: {
    create: "role:create",
    update: "role:update",
    delete: "role:delete",
  },
  /** 权限管理 - 用户角色分配 */
  userRole: {
    assign: "user_role:assign",
  },
  /** 多维表格管理 */
  tables: {
    create: "multi_dimension_tables:create",
    update: "multi_dimension_tables:update",
    delete: "multi_dimension_tables:delete",
  },
} as const;

export type ButtonPermissionCode = string;

/**
 * 判断用户是否具备某按钮/接口权限（用于显隐新建、编辑、删除等按钮）
 * 使用方若在 React 组件内需随 user 更新而重渲染，请确保组件用 observer 包裹并读取 userStore.user
 */
export function hasButtonPermission(
  user: { is_superuser?: boolean; is_team_admin?: boolean; api_permission_codes?: string[] } | null,
  code: ButtonPermissionCode
): boolean {
  if (!user) return false;
  // 系统超级管理员和团队管理员都拥有所有权限
  if (user.is_superuser || user.is_team_admin) return true;
  return !!(user.api_permission_codes ?? []).includes(code);
}

/**
 * Hook：当前用户是否具备某接口权限。用于接口级控制。
 * 使用此 hook 的组件需用 observer 包裹，以便在 userStore 更新时重渲染。
 */
export function useHasButtonPermission(code: ButtonPermissionCode): boolean {
  const user = userStore.user;
  return hasButtonPermission(user, code);
}

export type MenuButtonPermissionCode = string;

/**
 * 判断用户是否具备某「菜单按钮」权限（用于显隐新建、编辑、删除等，与后端接口无关）
 */
export function hasMenuButtonPermission(
  user: { is_superuser?: boolean; is_team_admin?: boolean; menu_permission_codes?: string[] } | null,
  code: MenuButtonPermissionCode
): boolean {
  if (!user) return false;
  
  // 团队管理相关的按钮权限仅系统管理员可见
  if (code.startsWith("menu:team") || code.startsWith("menu:teams")) {
    return user.is_superuser === true;
  }
  
  // 系统超级管理员：只能看到团队管理相关的权限（已在上面处理）
  if (user.is_superuser) return false;
  
  // 团队管理员：拥有除团队管理外的所有权限
  if (user.is_team_admin) return true;
  
  // 普通用户：只能看到通过角色分配的权限
  return !!(user.menu_permission_codes ?? []).includes(code);
}

/**
 * Hook：当前用户是否具备某菜单按钮权限。用于控制页面上新建、编辑、删除等按钮显隐。
 * 由「菜单权限」分配，与后端接口校验无关。
 */
export function useHasMenuButtonPermission(code: MenuButtonPermissionCode): boolean {
  const user = userStore.user;
  return hasMenuButtonPermission(user, code);
}
