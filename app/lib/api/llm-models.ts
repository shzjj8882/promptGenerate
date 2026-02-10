/**
 * LLM 模型管理 API
 */
import { apiRequest } from "./config";

export interface LLMModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  api_key?: string;
  api_base?: string;
  default_temperature?: string;
  default_max_tokens?: number;
  description?: string;
  config?: Record<string, any>;
  is_active: boolean;
  is_default: boolean;
  team_id?: string;
  created_at: string;
  updated_at: string;
}

export interface LLMModelCreate {
  name: string;
  provider: string;
  model: string;
  api_key?: string;
  api_base?: string;
  default_temperature?: string;
  default_max_tokens?: number;
  description?: string;
  config?: Record<string, any>;
  is_active?: boolean;
  is_default?: boolean;
  team_id?: string;
}

export interface LLMModelUpdate {
  name?: string;
  provider?: string;
  model?: string;
  api_key?: string;
  api_base?: string;
  default_temperature?: string;
  default_max_tokens?: number;
  description?: string;
  config?: Record<string, any>;
  is_active?: boolean;
  is_default?: boolean;
}

export interface LLMModelListResponse {
  items: LLMModel[];
  total: number;
  skip: number;
  limit: number;
}

/**
 * 获取模型列表
 */
export async function getLLMModels(params?: {
  team_id?: string;
  is_active?: boolean;
  skip?: number;
  limit?: number;
}): Promise<LLMModelListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.team_id) searchParams.append("team_id", params.team_id);
  if (params?.is_active !== undefined) searchParams.append("is_active", String(params.is_active));
  if (params?.skip) searchParams.append("skip", String(params.skip));
  if (params?.limit) searchParams.append("limit", String(params.limit));
  
  const query = searchParams.toString();
  return apiRequest<LLMModelListResponse>(`/admin/models?${query}`);
}

/**
 * 获取模型详情
 */
export async function getLLMModel(modelId: string): Promise<LLMModel> {
  return apiRequest<LLMModel>(`/admin/models/${modelId}`);
}

/**
 * 创建模型
 */
export async function createLLMModel(data: LLMModelCreate): Promise<LLMModel> {
  return apiRequest<LLMModel>("/admin/models", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * 更新模型
 */
export async function updateLLMModel(modelId: string, data: LLMModelUpdate): Promise<LLMModel> {
  return apiRequest<LLMModel>(`/admin/models/${modelId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * 删除模型
 */
export async function deleteLLMModel(modelId: string): Promise<void> {
  return apiRequest<void>(`/admin/models/${modelId}`, {
    method: "DELETE",
  });
}

/**
 * 获取默认模型
 */
export async function getDefaultLLMModel(): Promise<LLMModel> {
  return apiRequest<LLMModel>("/admin/models/default");
}
