/**
 * RBAC权限管理相关 API
 */

import { apiRequest, ApiError } from "./config";

/**
 * 权限类型：menu=菜单权限（控制侧栏与路由），api=接口权限
 */
export type PermissionType = "menu" | "api";

/**
 * 权限信息
 */
export interface Permission {
  id: string;
  name: string;
  code: string;
  resource: string;
  action: string;
  type?: PermissionType;
  description?: string;
  parent_id?: string;
  sort_order?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  children?: Permission[];
}

/**
 * 创建权限请求参数
 */
export interface PermissionCreate {
  name: string;
  code: string;
  resource: string;
  action: string;
  type?: PermissionType;
  description?: string;
  parent_id?: string;
  sort_order?: number;
  is_active?: boolean;
}

/**
 * 更新权限请求参数
 */
export interface PermissionUpdate {
  name?: string;
  description?: string;
  parent_id?: string;
  sort_order?: number;
  is_active?: boolean;
}

/**
 * 权限列表响应
 */
export interface PermissionsResponse {
  items: Permission[];
  total: number;
  skip: number;
  limit: number;
}

/**
 * 角色信息
 */
export interface Role {
  id: string;
  name: string;
  code: string;
  team_code?: string; // 团队代码（undefined/null表示全局角色）
  description?: string;
  is_active: boolean;
  permissions: Permission[];
  created_at: string;
  updated_at: string;
}

/**
 * 创建角色请求参数
 */
export interface RoleCreate {
  name: string;
  code: string;
  description?: string;
  is_active?: boolean;
  permission_ids?: string[];
}

/**
 * 更新角色请求参数
 */
export interface RoleUpdate {
  name?: string;
  description?: string;
  is_active?: boolean;
  permission_ids?: string[];
}

/**
 * 角色列表响应
 */
export interface RolesResponse {
  items: Role[];
  total: number;
  skip: number;
  limit: number;
}

/** 权限分组接口返回：平铺列表 + 展示顺序/文案，前端用 groupBy 按类型组合 */
export interface PermissionsGroupedRawResponse {
  items: Permission[];
  resource_order?: string[];
  resource_labels?: Record<string, string>;
}

/** 前端用 groupBy 从平铺数据组合后的结构，供权限管理/角色分配使用 */
export interface PermissionsGroupedResponse {
  menu: {
    route: Record<string, Permission[]>;
    button: Record<string, Permission[]>;
  };
  api: Record<string, Permission[]>;
  resource_order?: string[];
  resource_labels?: Record<string, string>;
}

/**
 * 获取权限平铺列表及展示顺序/文案（用于权限管理/角色分配；前端用 groupBy 按类型组合）
 */
export async function getPermissionsGrouped(params?: {
  is_active?: boolean;
}): Promise<PermissionsGroupedRawResponse> {
  const queryParams = new URLSearchParams();
  if (params?.is_active !== undefined) queryParams.append("is_active", params.is_active.toString());
  const q = queryParams.toString();
  return apiRequest<PermissionsGroupedRawResponse>(
    `/admin/rbac/permissions/grouped${q ? `?${q}` : ""}`
  );
}

/**
 * 获取权限列表
 */
export async function getPermissions(params?: {
  skip?: number;
  limit?: number;
  resource?: string;
  is_active?: boolean;
  type?: "menu" | "api";
}): Promise<PermissionsResponse> {
  const queryParams = new URLSearchParams();
  if (params?.skip !== undefined) queryParams.append("skip", params.skip.toString());
  if (params?.limit !== undefined) queryParams.append("limit", params.limit.toString());
  if (params?.resource !== undefined) queryParams.append("resource", params.resource);
  if (params?.is_active !== undefined) queryParams.append("is_active", params.is_active.toString());
  if (params?.type !== undefined) queryParams.append("type", params.type);
  
  const queryString = queryParams.toString();
  const path = `/admin/rbac/permissions${queryString ? `?${queryString}` : ""}`;
  
  return apiRequest<PermissionsResponse>(path);
}

/**
 * 获取单个权限
 */
export async function getPermission(permissionId: string): Promise<Permission> {
  return apiRequest<Permission>(`/admin/rbac/permissions/${permissionId}`);
}

/**
 * 创建权限
 */
export async function createPermission(data: PermissionCreate): Promise<Permission> {
  return apiRequest<Permission>("/admin/rbac/permissions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * 更新权限
 */
export async function updatePermission(permissionId: string, data: PermissionUpdate): Promise<Permission> {
  return apiRequest<Permission>(`/admin/rbac/permissions/${permissionId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * 更新菜单配置（支持团队级别的覆盖）
 */
export async function updateMenuConfig(
  permissionId: string,
  data: { parent_id?: string | null; sort_order: number }
): Promise<{
  id: string;
  permission_id: string;
  team_id: string | null;
  parent_id: string | null;
  sort_order: number;
}> {
  return apiRequest(`/admin/rbac/menus/${permissionId}/config`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * 删除权限
 */
export async function deletePermission(permissionId: string): Promise<void> {
  return apiRequest<void>(`/admin/rbac/permissions/${permissionId}`, {
    method: "DELETE",
  });
}

/**
 * 获取角色列表
 */
export async function getRoles(params?: {
  skip?: number;
  limit?: number;
  is_active?: boolean;
}): Promise<RolesResponse> {
  const queryParams = new URLSearchParams();
  if (params?.skip !== undefined) queryParams.append("skip", params.skip.toString());
  if (params?.limit !== undefined) queryParams.append("limit", params.limit.toString());
  if (params?.is_active !== undefined) queryParams.append("is_active", params.is_active.toString());
  
  const queryString = queryParams.toString();
  const path = `/admin/rbac/roles${queryString ? `?${queryString}` : ""}`;
  
  return apiRequest<RolesResponse>(path);
}

/**
 * 获取单个角色
 */
export async function getRole(roleId: string): Promise<Role> {
  return apiRequest<Role>(`/admin/rbac/roles/${roleId}`);
}

/**
 * 创建角色
 */
export async function createRole(data: RoleCreate): Promise<Role> {
  return apiRequest<Role>("/admin/rbac/roles", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * 更新角色
 */
export async function updateRole(roleId: string, data: RoleUpdate): Promise<Role> {
  return apiRequest<Role>(`/admin/rbac/roles/${roleId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * 删除角色
 */
export async function deleteRole(roleId: string): Promise<void> {
  return apiRequest<void>(`/admin/rbac/roles/${roleId}`, {
    method: "DELETE",
  });
}

/**
 * 菜单项（树形结构）
 */
export interface MenuItem {
  id: string;
  name: string;
  code: string;
  resource: string;
  action: string;
  type: PermissionType;
  description?: string;
  parent_id?: string;
  parentId?: string;  // camelCase 格式（与 parent_id 相同）
  sort_order?: number;
  sortOrder?: number;  // camelCase 格式（与 sort_order 相同）
  is_active: boolean;
  children?: MenuItem[];
}

/**
 * 获取菜单树
 */
export async function getMenuTree(): Promise<MenuItem[]> {
  return apiRequest<MenuItem[]>("/admin/rbac/menus/tree");
}
