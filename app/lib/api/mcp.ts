/**
 * MCP 配置管理 API
 */
import { apiRequest } from "./config";

export interface MCPTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPConfig {
  id: string;
  name: string;
  url: string;
  transport_type?: "sse" | "streamable_http";
  auth_info?: Record<string, unknown>;
  tools_cache?: MCPTool[];
  team_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MCPConfigCreate {
  name: string;
  url: string;
  transport_type?: "sse" | "streamable_http";
  auth_info?: Record<string, unknown>;
  is_active?: boolean;
  team_id?: string;
}

export interface MCPConfigUpdate {
  name?: string;
  url?: string;
  transport_type?: "sse" | "streamable_http";
  auth_info?: Record<string, unknown>;
  is_active?: boolean;
}

export interface MCPConfigListResponse {
  items: MCPConfig[];
  total: number;
  skip: number;
  limit: number;
}

export interface MCPVerifyResponse {
  success: boolean;
  message?: string;
  tools?: MCPTool[];
}

/**
 * 获取 MCP 配置列表
 */
export async function getMCPConfigs(params?: {
  team_id?: string;
  is_active?: boolean;
  skip?: number;
  limit?: number;
}): Promise<MCPConfigListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.team_id) searchParams.append("team_id", params.team_id);
  if (params?.is_active !== undefined) searchParams.append("is_active", String(params.is_active));
  if (params?.skip) searchParams.append("skip", String(params.skip));
  if (params?.limit) searchParams.append("limit", String(params.limit));

  const query = searchParams.toString();
  return apiRequest<MCPConfigListResponse>(`/admin/mcp?${query}`);
}

/**
 * 获取用于调试的 MCP 列表
 */
export async function getMCPConfigsForDebug(): Promise<{ items: MCPConfig[] }> {
  return apiRequest<{ items: MCPConfig[] }>("/admin/mcp/list-for-debug");
}

/**
 * 获取 MCP 配置详情
 */
export async function getMCPConfig(id: string): Promise<MCPConfig> {
  return apiRequest<MCPConfig>(`/admin/mcp/${id}`);
}

/**
 * 验证 MCP 连接
 */
export async function verifyMCPConnection(
  url: string,
  auth_info?: Record<string, unknown>,
  transport_type?: "sse" | "streamable_http"
): Promise<MCPVerifyResponse> {
  return apiRequest<MCPVerifyResponse>("/admin/mcp/verify", {
    method: "POST",
    body: JSON.stringify({ url, auth_info, transport_type: transport_type ?? "sse" }),
  });
}

/**
 * 创建 MCP 配置
 */
export async function createMCPConfig(data: MCPConfigCreate): Promise<MCPConfig> {
  return apiRequest<MCPConfig>("/admin/mcp", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * 更新 MCP 配置
 */
export async function updateMCPConfig(id: string, data: MCPConfigUpdate): Promise<MCPConfig> {
  return apiRequest<MCPConfig>(`/admin/mcp/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * 刷新 MCP 工具列表
 */
export async function refreshMCPTools(id: string): Promise<MCPConfig> {
  return apiRequest<MCPConfig>(`/admin/mcp/${id}/refresh`, {
    method: "POST",
  });
}

/**
 * 删除 MCP 配置
 */
export async function deleteMCPConfig(id: string): Promise<void> {
  return apiRequest<void>(`/admin/mcp/${id}`, {
    method: "DELETE",
  });
}
