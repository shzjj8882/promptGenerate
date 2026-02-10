/**
 * 提示词管理相关 API（admin）
 */

import { apiRequest } from "./config";

export interface Prompt {
  id: string;
  scene: string;
  tenant_id: string;
  content: string;
  placeholders: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromptCreate {
  scene: string;
  tenant_id: string;
  content: string;
  placeholders?: string[];
}

export interface PromptUpdate {
  content?: string;
  placeholders?: string[];
}

export interface GetPromptsParams {
  scene?: string;
  tenant_id?: string;
  is_default?: boolean;
  skip?: number;
  limit?: number;
}

export async function getPrompts(params?: GetPromptsParams): Promise<Prompt[]> {
  const queryParams = new URLSearchParams();
  if (params?.scene) queryParams.append("scene", params.scene);
  if (params?.tenant_id) queryParams.append("tenant_id", params.tenant_id);
  if (params?.is_default !== undefined) queryParams.append("is_default", params.is_default.toString());
  if (params?.skip !== undefined) queryParams.append("skip", params.skip.toString());
  if (params?.limit !== undefined) queryParams.append("limit", params.limit.toString());
  
  const queryString = queryParams.toString();
  const path = `/admin/prompts${queryString ? `?${queryString}` : ""}`;
  
  return apiRequest<Prompt[]>(path);
}

export async function getPromptBySceneTenant(params: {
  scene: string;
  tenant_id: string;
}): Promise<Prompt | null> {
  const query = new URLSearchParams(params).toString();
  return apiRequest<Prompt | null>(`/admin/prompts/by_scene_tenant?${query}`);
}

export async function getPrompt(promptId: string): Promise<Prompt> {
  return apiRequest<Prompt>(`/admin/prompts/${promptId}`);
}

export async function createPrompt(data: PromptCreate): Promise<Prompt> {
  return apiRequest<Prompt>("/admin/prompts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updatePrompt(promptId: string, data: PromptUpdate): Promise<Prompt> {
  return apiRequest<Prompt>(`/admin/prompts/${promptId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deletePrompt(promptId: string): Promise<void> {
  return apiRequest<void>(`/admin/prompts/${promptId}`, {
    method: "DELETE",
  });
}

export interface GetPlaceholdersParams {
  scene?: string;
  skip?: number;
  limit?: number;
}

export interface PaginatedPlaceholdersResponse {
  items: Placeholder[];
  total: number;
  skip: number;
  limit: number;
}

export interface Placeholder {
  id: string;
  key: string;
  label: string;
  scene?: string;  // 可选，占位符与场景值独立
  description?: string;
  method?: string;
  method_params?: string;
  tenant_param_key?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlaceholderCreate {
  key: string;
  label: string;
  scene?: string;  // 可选，占位符与场景值独立，在场景值配置时选择占位符
  description?: string;
  method?: string;
  method_params?: string;
  tenant_param_key?: string;
  // 新增字段：支持多维表格数据源
  data_source_type?: string; // user_input | multi_dimension_table
  data_type?: string; // string | number | boolean | date
  table_id?: string; // 多维表格 ID
  table_column_key?: string; // 多维表格列 key
  table_row_id_param_key?: string; // 多维表格行 ID 参数 key
}

export async function getPlaceholders(params?: GetPlaceholdersParams): Promise<PaginatedPlaceholdersResponse> {
  const queryParams = new URLSearchParams();
  if (params?.scene) queryParams.append("scene", params.scene);
  if (params?.skip !== undefined) queryParams.append("skip", params.skip.toString());
  if (params?.limit !== undefined) queryParams.append("limit", params.limit.toString());
  
  const queryString = queryParams.toString();
  const path = `/admin/placeholders${queryString ? `?${queryString}` : ""}`;
  
  // 如果后端返回的是数组（旧格式），转换为分页响应格式
  const response = await apiRequest<any>(path);
  
  // 检查是否是分页响应格式
  if (response && typeof response === 'object' && 'items' in response && 'total' in response) {
    return response as PaginatedPlaceholdersResponse;
  }
  
  // 如果是数组（旧格式），转换为分页响应格式
  if (Array.isArray(response)) {
    return {
      items: response,
      total: response.length,
      skip: params?.skip || 0,
      limit: params?.limit || response.length,
    };
  }
  
  // 默认返回空分页响应
  return {
    items: [],
    total: 0,
    skip: params?.skip || 0,
    limit: params?.limit || 10,
  };
}

export interface PlaceholderUpdate {
  label?: string;
  description?: string;
  method?: string;
  method_params?: string;
  tenant_param_key?: string;
  // 新增字段：支持多维表格数据源
  data_source_type?: string;
  data_type?: string;
  table_id?: string;
  table_column_key?: string;
  table_row_id_param_key?: string;
}

export async function createPlaceholder(data: PlaceholderCreate): Promise<Placeholder> {
  return apiRequest<Placeholder>("/admin/placeholders", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updatePlaceholder(placeholderId: string, data: PlaceholderUpdate): Promise<Placeholder> {
  return apiRequest<Placeholder>(`/admin/placeholders/${placeholderId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deletePlaceholder(placeholderId: string): Promise<void> {
  return apiRequest<void>(`/admin/placeholders/${placeholderId}`, {
    method: "DELETE",
  });
}


