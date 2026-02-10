/**
 * 用户管理相关 API
 */

import { apiRequest, ApiError } from "./config";

/**
 * 用户信息
 */
export interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  team_code?: string;
  is_active: boolean;
  is_superuser: boolean;
  is_team_admin?: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 管理员更新用户信息请求参数
 */
export interface UserAdminUpdate {
  email?: string;
  full_name?: string;
  is_active?: boolean;
  is_team_admin?: boolean;
  team_code?: string;
}

/**
 * 用户列表响应
 */
export interface UsersResponse {
  items: User[];
  total: number;
  skip: number;
  limit: number;
}

/**
 * 获取用户列表
 */
export async function getUsers(params?: {
  skip?: number;
  limit?: number;
  is_active?: boolean;
}): Promise<UsersResponse> {
  const queryParams = new URLSearchParams();
  if (params?.skip !== undefined) queryParams.append("skip", params.skip.toString());
  if (params?.limit !== undefined) queryParams.append("limit", params.limit.toString());
  if (params?.is_active !== undefined) queryParams.append("is_active", params.is_active.toString());
  
  const queryString = queryParams.toString();
  const path = `/admin/auth/users${queryString ? `?${queryString}` : ""}`;
  
  return apiRequest<UsersResponse>(path);
}

/**
 * 获取用户当前的角色ID列表
 */
export async function getUserRoles(userId: string): Promise<string[]> {
  return apiRequest<string[]>(`/admin/rbac/users/${userId}/roles`);
}

/**
 * 批量获取用户角色ID，返回 { user_id: role_id[] }，一次请求替代 N 次 getUserRoles
 */
export async function getUserRolesBatch(userIds: string[]): Promise<Record<string, string[]>> {
  if (userIds.length === 0) return {};
  return apiRequest<Record<string, string[]>>("/admin/rbac/users/roles-batch", {
    method: "POST",
    body: JSON.stringify({ user_ids: userIds }),
  });
}

/**
 * 为用户分配角色
 */
export async function assignRolesToUser(userId: string, roleIds: string[]): Promise<void> {
  return apiRequest<void>(`/admin/rbac/users/${userId}/roles`, {
    method: "POST",
    body: JSON.stringify(roleIds),
  });
}

/**
 * 获取用户权限
 */
export async function getUserPermissions(userId: string): Promise<any[]> {
  return apiRequest<any[]>(`/admin/rbac/users/${userId}/permissions`);
}

/**
 * 管理员更新用户信息
 */
export async function updateUserAdmin(userId: string, data: UserAdminUpdate): Promise<User> {
  return apiRequest<User>(`/admin/auth/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * 管理员删除用户（仅系统超级管理员）
 */
export async function deleteUserAdmin(userId: string): Promise<void> {
  return apiRequest<void>(`/admin/auth/users/${userId}`, {
    method: "DELETE",
  });
}
