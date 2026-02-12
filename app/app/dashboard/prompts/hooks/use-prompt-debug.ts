"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { flushSync } from "react-dom";
import { streamPromptChat, convertPrompt, apiPrompt, type LLMConfig, type SSEChunk } from "@/lib/api/llmchat";
import { logger } from "@/lib/utils/logger";
import { userStore } from "@/store/user-store";
import type { Prompt } from "../prompts-client";

interface DebugMessage {
  role: "user" | "assistant";
  content: string;
}

interface NotificationOption {
  type?: "none" | "email";
  config_id?: string;
  email_to?: string;
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
}: UsePromptDebugOptions) {
  const [messages, setMessages] = useState<DebugMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
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
  }, []);

  // 发送调试消息
  const sendMessage = useCallback(async () => {
    if (!prompt || !input.trim() || streaming) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setStreaming(true);

    // 添加一个空的助手消息，用于更新
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      if (debugMode === "chat") {
        // 聊天模式：使用 SSE 流式响应
        await streamPromptChat(
          prompt.scene,
          {
            user_message: userMessage,
            tenantCode: tenantCode?.trim() || undefined,
            additional_params: placeholderParams,
            llm_config: llmConfig,
            model_id: modelId || undefined,
            mcp_id: mcpId || undefined,
            mcp_tool_names: mcpToolNames?.length ? mcpToolNames : undefined,
          },
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
        // 接口模式：使用 HTTP 请求
        const request: any = {
          user_message: userMessage,
          tenantCode: tenantCode?.trim() || undefined,
          additional_params: placeholderParams,
          llm_config: llmConfig,
          model_id: modelId || undefined,
          mcp_id: mcpId || undefined,
          mcp_tool_names: mcpToolNames?.length ? mcpToolNames : undefined,
        };
        if (notification?.type && notification.type !== "none" && notification.email_to) {
          request.notification = {
            type: notification.type,
            config_id: notification.config_id,
            email_to: notification.email_to,
          };
        }
        const response = await apiPrompt(prompt.scene, request);

        if ("task_id" in response) {
          // 异步模式（生产者-消费者）：任务已入队，Worker 消费后发邮件，前端不轮询
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === "assistant") {
              lastMessage.content = "任务已提交，完成后将发送邮件通知。任务ID: " + response.task_id;
            }
            return newMessages;
          });
          setStreaming(false);
        } else {
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === "assistant") {
              lastMessage.content = response.content || "无响应";
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
  }, [prompt, input, streaming, debugMode, tenantCode, placeholderParams, llmConfig, modelId, mcpId, mcpToolNames, notification]);

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
    if (notification?.type && notification.type !== "none" && notification.email_to) {
      requestBody.notification = {
        type: notification.type,
        config_id: notification.config_id,
        email_to: notification.email_to,
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
    chatMessagesEndRef,
    setInput,
    sendMessage,
    reset,
    generateCurl,
  };
}
