/**
 * 组合配置 API
 */

import { apiRequest } from "./config";

export interface Composition {
  id: string;
  name: string;
  mode: "chat" | "api";
  scene: string;
  tenant_id: string;
  prompt_id?: string | null;
  model_id?: string | null;
  mcp_id?: string | null;
  mcp_tool_names?: string[];
  task_mode: "sync" | "async";
  notification_config?: {
    type?: string;
    email_to?: string;
    email_content_type?: "html" | "plain" | "file";
    content_type?: "html" | "plain" | "file";
    config_id?: string;
  } | null;
  team_id?: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface CompositionCreate {
  name: string;
  mode: "chat" | "api";
  scene: string;
  tenant_id?: string;
  prompt_id?: string | null;
  model_id?: string | null;
  mcp_id?: string | null;
  mcp_tool_names?: string[];
  task_mode?: "sync" | "async";
  notification_config?: Composition["notification_config"];
  sort_order?: number;
}

export interface CompositionUpdate {
  name?: string;
  scene?: string;
  tenant_id?: string;
  prompt_id?: string | null;
  model_id?: string | null;
  mcp_id?: string | null;
  mcp_tool_names?: string[];
  task_mode?: "sync" | "async";
  notification_config?: Composition["notification_config"];
  sort_order?: number;
  is_active?: boolean;
}

export interface GetCompositionsParams {
  skip?: number;
  limit?: number;
  keyword?: string;
}

export interface PaginatedCompositionsResponse {
  items: Composition[];
  total: number;
  skip: number;
  limit: number;
}

export async function getCompositions(params?: GetCompositionsParams): Promise<PaginatedCompositionsResponse> {
  const queryParams = new URLSearchParams();
  if (params?.skip !== undefined) queryParams.append("skip", params.skip.toString());
  if (params?.limit !== undefined) queryParams.append("limit", params.limit.toString());
  if (params?.keyword) queryParams.append("keyword", params.keyword);
  const queryString = queryParams.toString();
  const data = await apiRequest<PaginatedCompositionsResponse>(
    `/admin/compositions${queryString ? `?${queryString}` : ""}`
  );
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total: typeof data?.total === "number" ? data.total : 0,
    skip: typeof data?.skip === "number" ? data.skip : 0,
    limit: typeof data?.limit === "number" ? data.limit : 10,
  };
}

export async function createComposition(data: CompositionCreate): Promise<Composition> {
  return apiRequest<Composition>("/admin/compositions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateComposition(
  id: string,
  data: CompositionUpdate
): Promise<Composition> {
  return apiRequest<Composition>(`/admin/compositions/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteComposition(id: string): Promise<void> {
  return apiRequest<void>(`/admin/compositions/${id}`, {
    method: "DELETE",
  });
}
