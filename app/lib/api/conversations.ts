/**
 * 会话管理 API
 */
import { apiRequest } from "./config";

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: "system" | "user" | "assistant";
  content: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface Conversation {
  id: string;
  scene: string;
  team_id?: string;
  tenant_id?: string;
  title?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  messages?: ConversationMessage[];
}

export interface ConversationCreate {
  scene: string;
  tenant_id?: string;
  title?: string;
  metadata?: Record<string, any>;
}

export interface ConversationUpdate {
  title?: string;
  metadata?: Record<string, any>;
}

export interface ConversationMessageCreate {
  role: "system" | "user" | "assistant";
  content: string;
  metadata?: Record<string, any>;
}

export interface ConversationListResponse {
  items: Conversation[];
  total: number;
  skip: number;
  limit: number;
}

/**
 * 创建会话
 */
export async function createConversation(data: ConversationCreate): Promise<Conversation> {
  return apiRequest<Conversation>("/admin/conversations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * 获取会话列表
 */
export async function getConversations(params?: {
  scene?: string;
  tenant_id?: string;
  skip?: number;
  limit?: number;
}): Promise<ConversationListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.scene) searchParams.append("scene", params.scene);
  if (params?.tenant_id) searchParams.append("tenant_id", params.tenant_id);
  if (params?.skip) searchParams.append("skip", String(params.skip));
  if (params?.limit) searchParams.append("limit", String(params.limit));
  
  const query = searchParams.toString();
  return apiRequest<ConversationListResponse>(`/admin/conversations?${query}`);
}

/**
 * 获取会话详情
 */
export async function getConversation(conversationId: string, includeMessages: boolean = true): Promise<Conversation> {
  return apiRequest<Conversation>(`/admin/conversations/${conversationId}?include_messages=${includeMessages}`);
}

/**
 * 更新会话
 */
export async function updateConversation(conversationId: string, data: ConversationUpdate): Promise<Conversation> {
  return apiRequest<Conversation>(`/admin/conversations/${conversationId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * 删除会话
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  return apiRequest<void>(`/admin/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

/**
 * 添加消息到会话
 */
export async function addConversationMessage(conversationId: string, data: ConversationMessageCreate): Promise<ConversationMessage> {
  return apiRequest<ConversationMessage>(`/admin/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * 获取会话消息列表
 */
export async function getConversationMessages(conversationId: string, params?: {
  skip?: number;
  limit?: number;
}): Promise<ConversationMessage[]> {
  const searchParams = new URLSearchParams();
  if (params?.skip) searchParams.append("skip", String(params.skip));
  if (params?.limit) searchParams.append("limit", String(params.limit));
  
  const query = searchParams.toString();
  return apiRequest<ConversationMessage[]>(`/admin/conversations/${conversationId}/messages?${query}`);
}

/**
 * 获取会话历史（用于上下文）
 */
export async function getConversationHistory(conversationId: string, maxMessages: number = 10): Promise<Array<{
  role: string;
  content: string;
  metadata?: Record<string, any>;
}>> {
  return apiRequest(`/admin/conversations/${conversationId}/history?max_messages=${maxMessages}`);
}
