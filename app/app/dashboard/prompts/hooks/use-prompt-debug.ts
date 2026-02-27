"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { flushSync } from "react-dom";
import { streamPromptChat, convertPrompt, apiPrompt, getLLMChatTask, type LLMConfig, type SSEChunk } from "@/lib/api/llmchat";
import { logger } from "@/lib/utils/logger";
import { userStore } from "@/store/user-store";
import { getAuthToken } from "@/lib/api/config";
import type { Prompt } from "../prompts-client";

interface DebugMessage {
  role: "user" | "assistant";
  content: string;
}

interface NotificationOption {
  type?: "none" | "email";
  config_id?: string;
  email_to?: string;
  email_content_type?: "html" | "plain" | "file";
}

interface UsePromptDebugOptions {
  prompt: Prompt | null;
  tenantCode: string;
  llmConfig: LLMConfig;
  // 支持嵌套对象结构：{key: {condition_field: value}} 或 {key: value}
  placeholderParams: Record<string, any>;
  debugMode: "chat" | "api";
  modelId?: string;
  mcpId?: string;
  mcpToolNames?: string[];
  notification?: NotificationOption;
  /** 组合 API 完整 URL（有则使用此 URL 替代默认提示词 API） */
  compositionApiUrl?: string | null;
}

/**
 * 提示词调试 Hook
 * 管理调试对话框的状态和逻辑
 */
export function usePromptDebug({
  prompt,
  tenantCode,
  llmConfig,
  placeholderParams,
  debugMode,
  modelId,
  mcpId,
  mcpToolNames,
  notification,
  compositionApiUrl,
}: UsePromptDebugOptions) {
  const [messages, setMessages] = useState<DebugMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [rawApiResponse, setRawApiResponse] = useState<unknown>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部（流式响应时实时滚动）
  useEffect(() => {
    if (streaming && chatMessagesEndRef.current) {
      // 流式响应时使用 instant 滚动，确保实时跟随
      chatMessagesEndRef.current.scrollIntoView({ behavior: "instant" });
    } else if (messages.length > 0) {
      // 非流式时使用 smooth 滚动
      const timer = setTimeout(() => {
        chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages, streaming]);

  // 重置调试状态
  const reset = useCallback(() => {
    setMessages([]);
    setInput("");
    setStreaming(false);
    setRawApiResponse(null);
  }, []);

  // 发送调试消息
  const sendMessage = useCallback(async () => {
    if (!prompt || !input.trim() || streaming) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setStreaming(true);
    setRawApiResponse(null);

    // 添加一个空的助手消息，用于更新
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const chatRequest = {
        user_message: userMessage,
        tenantCode: tenantCode?.trim() || undefined,
        additional_params: placeholderParams,
        llm_config: llmConfig,
        model_id: modelId || undefined,
        mcp_id: mcpId || undefined,
        mcp_tool_names: mcpToolNames?.length ? mcpToolNames : undefined,
      };
      const apiRequest: any = {
        ...chatRequest,
      };
      if (notification?.type === "email" && notification.email_to) {
        apiRequest.notification = {
          type: "email",
          config_id: notification.config_id,
          email_to: notification.email_to,
          email_content_type: notification.email_content_type || "html",
        };
      }

      if (compositionApiUrl) {
        // 组合 API：使用自定义 URL（tenantId 在 path 中，不传 tenantCode）
        const { compositionChatRequest, compositionApiRequest } = (() => {
          const base = { ...chatRequest };
          delete (base as any).tenantCode;
          return {
            compositionChatRequest: base,
            compositionApiRequest: { ...base, ...(apiRequest.notification ? { notification: apiRequest.notification } : {}) },
          };
        })();
        const token = getAuthToken();
        const teamAuthcode = userStore.user?.team_authcode;
        const headers: HeadersInit = {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(teamAuthcode ? { "X-Team-AuthCode": teamAuthcode } : {}),
        };

        if (debugMode === "chat") {
          const res = await fetch(compositionApiUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(compositionChatRequest),
          });
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          const reader = res.body?.getReader();
          if (!reader) throw new Error("无法获取响应流");
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              setStreaming(false);
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (trimmedLine.startsWith("data: ")) {
                const data = trimmedLine.slice(6).trim();
                if (data === "[DONE]") {
                  setStreaming(false);
                  return;
                }
                if (data) {
                  try {
                    const chunk = JSON.parse(data);
                    if (chunk.content) {
                      flushSync(() => {
                        setMessages((prev) =>
                          prev.map((msg, idx) =>
                            idx === prev.length - 1 && msg.role === "assistant"
                              ? { ...msg, content: msg.content + (chunk.content || "") }
                              : msg
                          )
                        );
                      });
                    }
                  } catch {
                    // ignore parse error
                  }
                }
              }
            }
          }
        } else {
          const res = await fetch(compositionApiUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(compositionApiRequest),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ message: `HTTP error! status: ${res.status}` }));
            throw new Error(err.message || err.detail || `HTTP error! status: ${res.status}`);
          }
          const result = await res.json();
          setRawApiResponse(result);
          const data = result.data ?? result;
          if (data?.task_id) {
            const isEmailNotify = notification?.type === "email" && notification.email_to;
            if (isEmailNotify) {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") last.content = "任务已提交，完成后将发送邮件通知。任务ID: " + data.task_id;
                return next;
              });
              setStreaming(false);
            } else {
              // 异步队列模式：轮询获取结果
              const pollTask = async () => {
                const task = await getLLMChatTask(data.task_id);
                if (task.status === "completed") {
                  setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last?.role === "assistant") last.content = task.result_content || "无响应";
                    return next;
                  });
                  setStreaming(false);
                  return;
                }
                if (task.status === "failed") {
                  setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last?.role === "assistant") last.content = `错误: ${task.error_message || "任务执行失败"}`;
                    return next;
                  });
                  setStreaming(false);
                  return;
                }
                setTimeout(pollTask, 1500);
              };
              pollTask();
            }
          } else {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") last.content = data?.content || "无响应";
              return next;
            });
            setStreaming(false);
          }
        }
        return;
      }

      if (debugMode === "chat") {
        // 聊天模式：使用 SSE 流式响应
        await streamPromptChat(
          prompt.scene,
          chatRequest,
          (chunk: SSEChunk) => {
            // 使用 flushSync 强制同步更新，确保逐字显示
            flushSync(() => {
              setMessages((prev) => {
                // 创建新数组，避免直接修改原数组
                const newMessages = prev.map((msg, idx) => 
                  idx === prev.length - 1 && msg.role === "assistant"
                    ? { ...msg, content: msg.content + (chunk.content || "") }
                    : { ...msg }
                );
                return newMessages;
              });
            });
          },
          (error: Error) => {
            logger.error("流式响应错误", error);
            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage && lastMessage.role === "assistant") {
                lastMessage.content = `错误: ${error.message || "请求失败"}`;
              }
              return newMessages;
            });
            setStreaming(false);
          },
          () => {
            setStreaming(false);
          }
        );
      } else {
        // 接口模式：使用 HTTP 请求，返回完整响应便于调试
        const raw = await apiPrompt(prompt.scene, apiRequest);
        const response = raw as { data?: { content?: string; task_id?: string }; content?: string };
        const data = response?.data ?? response;
        setRawApiResponse(raw);

        if (data && "task_id" in data && data.task_id) {
          const isEmailNotify = notification?.type === "email" && notification.email_to;
          if (isEmailNotify) {
            // 邮件通知模式：任务已入队，Worker 消费后发邮件，前端不轮询
            setMessages((prev) => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage && lastMessage.role === "assistant") {
                lastMessage.content = "任务已提交，完成后将发送邮件通知。任务ID: " + data.task_id;
              }
              return newMessages;
            });
            setStreaming(false);
          } else {
            // 异步队列模式：轮询获取结果
            const taskId = data.task_id;
            const pollTask = async () => {
              if (!taskId) return;
              const task = await getLLMChatTask(taskId);
              if (task.status === "completed") {
                setMessages((prev) => {
                  const newMessages = [...prev];
                  const lastMessage = newMessages[newMessages.length - 1];
                  if (lastMessage && lastMessage.role === "assistant") {
                    lastMessage.content = task.result_content || "无响应";
                  }
                  return newMessages;
                });
                setStreaming(false);
                return;
              }
              if (task.status === "failed") {
                setMessages((prev) => {
                  const newMessages = [...prev];
                  const lastMessage = newMessages[newMessages.length - 1];
                  if (lastMessage && lastMessage.role === "assistant") {
                    lastMessage.content = `错误: ${task.error_message || "任务执行失败"}`;
                  }
                  return newMessages;
                });
                setStreaming(false);
                return;
              }
              // pending 或 running，继续轮询
              setTimeout(pollTask, 1500);
            };
            pollTask();
          }
        } else {
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === "assistant") {
              lastMessage.content = (data?.content ?? response?.content) || "无响应";
            }
            return newMessages;
          });
          setStreaming(false);
        }
      }
    } catch (error) {
      logger.error("发送调试消息失败", error);
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.role === "assistant") {
          lastMessage.content = `错误: ${error instanceof Error ? error.message : "请求失败"}`;
        }
        return newMessages;
      });
      setStreaming(false);
    }
  }, [prompt, input, streaming, debugMode, tenantCode, placeholderParams, llmConfig, modelId, mcpId, mcpToolNames, notification, compositionApiUrl]);

  // 生成 CURL 命令（业务场景，使用团队认证码）
  const generateCurl = useCallback((): string => {
    if (!prompt) return "";

    // 构建完整的 URL（包含域名）
    // 如果 API_BASE_URL 为空，使用当前页面的域名（通过 Nginx 或 rewrites 代理）
    let baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
    if (!baseUrl && typeof window !== "undefined") {
      // 使用当前页面的域名，确保 CURL 命令包含完整地址
      baseUrl = window.location.origin;
    }
    if (!baseUrl) {
      baseUrl = "http://localhost:3000"; // 默认值
    }
    baseUrl = baseUrl.replace(/\/$/, "");

    const endpoint = debugMode === "chat" 
      ? `/api/llmchat/prompts/${prompt.scene}/chat`
      : `/api/llmchat/prompts/${prompt.scene}/api`;

    const requestBody: any = {
      user_message: input.trim() || "",
    };

    if (tenantCode?.trim()) {
      requestBody.tenantCode = tenantCode.trim();
    }

    if (Object.keys(placeholderParams).length > 0) {
      requestBody.additional_params = placeholderParams;
    }

    if (modelId) {
      requestBody.model_id = modelId;
    }
    if (mcpId) {
      requestBody.mcp_id = mcpId;
    }
    if (mcpToolNames?.length) {
      requestBody.mcp_tool_names = mcpToolNames;
    }
    if (notification?.type === "email" && notification.email_to) {
      requestBody.notification = {
        type: "email",
        config_id: notification.config_id,
        email_to: notification.email_to,
        email_content_type: notification.email_content_type || "html",
      };
    }
    if (llmConfig.temperature !== undefined || llmConfig.max_tokens !== undefined) {
      requestBody.llm_config = {};
      if (llmConfig.temperature !== undefined) {
        requestBody.llm_config.temperature = llmConfig.temperature;
      }
      if (llmConfig.max_tokens !== undefined) {
        requestBody.llm_config.max_tokens = llmConfig.max_tokens;
      }
    }

    // 获取团队认证码（业务场景）
    const teamAuthcode = userStore.user?.team_authcode || "YOUR_TEAM_AUTHCODE";

    // 生成业务场景的 CURL 命令（使用团队认证码）
    const curlCommand = `curl -X POST "${baseUrl}${endpoint}" \\
  -H "Content-Type: application/json" \\
  -H "X-Team-AuthCode: ${teamAuthcode}" \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

    return curlCommand;
  }, [prompt, debugMode, input, tenantCode, placeholderParams, llmConfig, modelId, notification]);

  return {
    messages,
    input,
    streaming,
    rawApiResponse,
    chatMessagesEndRef,
    setInput,
    sendMessage,
    reset,
    generateCurl,
  };
}
