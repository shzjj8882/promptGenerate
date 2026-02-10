/**
 * 租户管理相关 API
 */

import { apiRequest, ApiError } from "./config";

/**
 * 租户信息（列表项，不包含敏感信息）
 */
export interface Tenant {
  id: string;
  code_id: string;
  name: string;
  description?: string;
  created_by?: string;
  updated_by?: string;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 租户详细信息（包含 app_id 和 app_secret）
 */
export interface TenantDetail extends Tenant {
  app_id?: string;
  app_secret?: string;
}

/**
 * 创建租户请求参数
 */
export interface TenantCreate {
  code_id: string;
  name: string;
  description?: string;
  app_id?: string;
  app_secret?: string;
}

/**
 * 更新租户请求参数
 */
export interface TenantUpdate {
  code_id?: string;
  name?: string;
  description?: string;
  app_id?: string;
  app_secret?: string;
  is_active?: boolean;
}

/**
 * 租户列表响应
 */
export interface TenantsResponse {
  items: Tenant[];
  total: number;
  skip: number;
  limit: number;
}

/**
 * 获取租户列表
 */
export async function getTenants(params?: {
  skip?: number;
  limit?: number;
  include_deleted?: boolean;
}): Promise<TenantsResponse> {
  const queryParams = new URLSearchParams();
  if (params?.skip !== undefined) queryParams.append("skip", params.skip.toString());
  if (params?.limit !== undefined) queryParams.append("limit", params.limit.toString());
  if (params?.include_deleted !== undefined) queryParams.append("include_deleted", params.include_deleted.toString());
  
  const queryString = queryParams.toString();
  const path = `/admin/tenants${queryString ? `?${queryString}` : ""}`;
  
  return apiRequest<TenantsResponse>(path);
}

/**
 * 获取单个租户
 */
export async function getTenant(tenantId: string): Promise<TenantDetail> {
  return apiRequest<TenantDetail>(`/admin/tenants/${tenantId}`);
}

/**
 * 创建租户
 */
export async function createTenant(data: TenantCreate): Promise<TenantDetail> {
  return apiRequest<TenantDetail>("/admin/tenants", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * 更新租户
 */
export async function updateTenant(tenantId: string, data: TenantUpdate): Promise<TenantDetail> {
  return apiRequest<TenantDetail>(`/admin/tenants/${tenantId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * 删除租户（逻辑删除）
 */
export async function deleteTenant(tenantId: string): Promise<void> {
  return apiRequest<void>(`/admin/tenants/${tenantId}`, {
    method: "DELETE",
  });
}

