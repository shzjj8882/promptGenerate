/**
 * LLM Chat 相关 API
 */

import { buildApiUrl, getAuthToken } from "./config";

export interface LLMConfig {
  temperature?: number;
  max_tokens?: number;
}

export interface PromptConvertRequest {
  tenantCode?: string;
  additional_params?: Record<string, any>;
}

export interface PromptChatRequest {
  tenantCode?: string;
  additional_params?: Record<string, any>;
  llm_config?: LLMConfig;
  user_message: string;
  conversation_id?: string;
  model_id?: string;
  mcp_id?: string;
  mcp_tool_names?: string[];
}

export interface PromptApiRequest {
  tenantCode?: string;
  additional_params?: Record<string, any>;
  llm_config?: LLMConfig;
  user_message: string;
  conversation_id?: string;
  model_id?: string;
  mcp_id?: string;
  mcp_tool_names?: string[];
}

export interface PromptApiResponse {
  content: string;
  scene: string;
  tenant_id: string;
}

export interface SSEChunk {
  content?: string;
  error?: string;
}

/**
 * 转换提示词（非流式）
 * @param scene 场景代码
 * @param request 请求参数
 */
export async function convertPrompt(
  scene: string,
  request: PromptConvertRequest
): Promise<{ content: string; scene: string; tenant_id: string }> {
  const url = buildApiUrl(`/api/llmchat/prompts/${scene}/convert`);
  const token = getAuthToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 调用 SSE 流式接口
 * @param scene 场景代码
 * @param request 请求参数
 * @param onChunk 接收到数据块时的回调
 * @param onError 错误回调
 * @param onDone 完成回调
 */
export async function streamPromptChat(
  scene: string,
  request: PromptChatRequest,
  onChunk: (chunk: SSEChunk) => void,
  onError?: (error: Error) => void,
  onDone?: () => void
): Promise<void> {
  const url = buildApiUrl(`/api/llmchat/prompts/${scene}/chat`);
  const token = getAuthToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("无法获取响应流");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        onDone?.();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("data: ")) {
          const data = trimmedLine.slice(6).trim();
          if (data === "[DONE]") {
            onDone?.();
            return;
          }

          if (data) {
            try {
              const chunk: SSEChunk = JSON.parse(data);
              if (chunk.content) {
                onChunk(chunk);
              }
            } catch (e) {
              console.error("解析 SSE 数据失败:", e, data);
            }
          }
        }
      }
    }
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * 调用接口模式（非流式）
 * @param scene 场景代码
 * @param request 请求参数
 */
export async function apiPrompt(
  scene: string,
  request: PromptApiRequest
): Promise<PromptApiResponse> {
  const url = buildApiUrl(`/api/llmchat/prompts/${scene}/api`);
  const token = getAuthToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}
