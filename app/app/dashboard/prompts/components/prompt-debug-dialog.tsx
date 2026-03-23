"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Send, ChevronLeft, ChevronRight, Copy, Check, Communication, Api } from "@/components/icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePromptDebug } from "../hooks/use-prompt-debug";
import {
  parsePlaceholdersFromText,
  parsePlaceholderDetails,
  checkIfTenantRequired,
  getSceneLabel,
} from "../utils/prompt-utils";
import type { Prompt, Placeholder } from "../prompts-client";
import type { LLMConfig } from "@/lib/api/llmchat";
import { API_BASE_URL } from "@/lib/api/config";
import { logger } from "@/lib/utils/logger";
import { usePlaceholderTables } from "../hooks/use-placeholder-tables";
import { cn } from "@/lib/utils";
import { userStore } from "@/store/user-store";
import { getLLMModels, type LLMModel } from "@/lib/api/llm-models";
import { getMCPConfigsForDebug, type MCPConfig } from "@/lib/api/mcp";
import { getNotificationConfigsForDebug } from "@/lib/api/notification-config";
import {
  type NotificationOption,
  toEmailContentType,
} from "@/app/dashboard/compositions/components/notification-option-picker";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { PromptDebugChatView } from "./prompt-debug-chat-view";
import { PromptDebugApiView } from "./prompt-debug-api-view";
import { PromptDebugParamsPanel } from "./prompt-debug-params-panel";

interface PromptDebugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: Prompt | null;
  tenants: Array<{ id: string; code_id: string; name: string }>;
  placeholders: Placeholder[];
  isMounted: boolean;
  /** 组合传入的默认模型 ID，用于预选 */
  initialModelId?: string | null;
  /** 组合传入的默认 MCP ID，用于预选 */
  initialMcpId?: string | null;
  /** 组合传入的调试模式，用于预选 */
  initialDebugMode?: "chat" | "api";
  /** 预览模式：隐藏调试模式切换等 */
  previewMode?: boolean;
  /** 组合 ID（有则使用 RESTful 组合 API 地址） */
  compositionId?: string | null;
  /** 组合名称（预览模式标题用） */
  compositionName?: string | null;
  /** 租户 ID（组合 API 用） */
  compositionTenantId?: string | null;
  /** 提示词 ID（组合 API 用） */
  compositionPromptId?: string | null;
  /** 组合预配置的 MCP 工具名（有则只读） */
  initialMcpToolNames?: string[] | null;
  /** 组合预配置的通知方式（有则只读） */
  initialNotificationOption?: NotificationOption | null;
}

/**
 * 提示词调试对话框组件
 * 用于测试和调试提示词的效果
 */
export function PromptDebugDialog({
  open,
  onOpenChange,
  prompt,
  tenants,
  placeholders,
  isMounted,
  initialModelId,
  initialMcpId,
  initialDebugMode,
  previewMode = false,
  compositionId,
  compositionName,
  compositionTenantId,
  compositionPromptId,
  initialMcpToolNames,
  initialNotificationOption,
}: PromptDebugDialogProps) {
  const [debugTenantCode, setDebugTenantCode] = useState<string>("");
  const [debugLLMConfig, setDebugLLMConfig] = useState<LLMConfig>({ temperature: 0.3 });
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [models, setModels] = useState<LLMModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  // 支持嵌套对象结构：{key: {condition_field: value}}
  const [debugPlaceholderParams, setDebugPlaceholderParams] = useState<Record<string, unknown>>({});
  const [debugMode, setDebugMode] = useState<"chat" | "api">("chat");
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const { copied: copiedCurl, copy, resetCopied } = useCopyToClipboard({ resetDelay: 2000 });
  const { tableInfoMap, loadingTables } = usePlaceholderTables(placeholders, !!open && !!prompt);
  // 跟踪哪个占位符的筛选弹出框是打开的
  const [openFilterPopover, setOpenFilterPopover] = useState<string | null>(null);
  // MCP 配置（用于场景调试中的 MCP 工具调用）
  const [mcpConfigs, setMcpConfigs] = useState<MCPConfig[]>([]);
  const [loadingMcps, setLoadingMcps] = useState(false);
  const [selectedMcpId, setSelectedMcpId] = useState<string>("__none__");
  const [selectedMcpToolNames, setSelectedMcpToolNames] = useState<Set<string>>(new Set());
  // 通知配置（仅接口模式）
  const [notificationOption, setNotificationOption] = useState<NotificationOption>("none");
  const [notificationEmailTo, setNotificationEmailTo] = useState("");
  const [notificationConfigs, setNotificationConfigs] = useState<Array<{ id: string; type: string; name: string }>>([]);
  const [loadingNotificationConfigs, setLoadingNotificationConfigs] = useState(false);
  const [headersExpanded, setHeadersExpanded] = useState(true);
  const [bodyExpanded, setBodyExpanded] = useState(true);
  const [queryExpanded, setQueryExpanded] = useState(false);
  // 组合 API 时，tenantId 可编辑（用于 Path 和 URL）
  const [editableTenantId, setEditableTenantId] = useState<string>("");
  // 接口模式请求参数 Tab：params | body | headers
  const [requestTab, setRequestTab] = useState<"params" | "body" | "headers">("body");
  // 响应区可编辑/粘贴，用于调试对比
  const [responseText, setResponseText] = useState("");

  // 构建 API 地址（需在 usePromptDebug 之前，供 compositionApiUrl 使用）
  const apiUrl = (() => {
    let base = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const b = API_BASE_URL?.replace(/\/$/, "");
    if (b) base = b;
    if (compositionId && compositionPromptId) {
      const tenantId = editableTenantId || compositionTenantId || "";
      const path = debugMode === "chat" ? "llm" : "request";
      return `${base}/admin/compositions/${compositionId}/tenant/${tenantId}/prompt/${compositionPromptId}/${path}`;
    }
    const ep = debugMode === "chat" ? "chat" : "api";
    return `${base}/admin/llmchat/prompts/${prompt?.scene}/${ep}`;
  })();

  const {
    messages,
    input,
    streaming,
    rawApiResponse,
    chatMessagesEndRef,
    setInput,
    sendMessage,
    reset,
    generateCurl,
  } = usePromptDebug({
    prompt,
    tenantCode: debugTenantCode,
    llmConfig: debugLLMConfig,
    placeholderParams: debugPlaceholderParams,
    debugMode,
    modelId: selectedModelId,
    mcpId: selectedMcpId && selectedMcpId !== "__none__" ? selectedMcpId : undefined,
    mcpToolNames: selectedMcpToolNames.size > 0 ? Array.from(selectedMcpToolNames) : undefined,
    notification:
      debugMode === "api" && notificationOption !== "none"
        ? {
            type: "email",
            email_to: notificationEmailTo?.trim(),
            email_content_type: toEmailContentType(notificationOption) ?? "html",
          }
        : undefined,
    compositionApiUrl: compositionId && compositionPromptId ? apiUrl : undefined,
  });

  // 组合传入的 initialDebugMode 在打开时生效
  useEffect(() => {
    if (open && initialDebugMode) {
      setDebugMode(initialDebugMode);
    }
  }, [open, initialDebugMode]);

  // 组合 API 时，editableTenantId 与 compositionTenantId 同步
  useEffect(() => {
    if (open && compositionTenantId) {
      setEditableTenantId(compositionTenantId);
    }
  }, [open, compositionTenantId]);

  // 组合 API 时，mcp_tool_names、notification 与组合配置同步（只读）
  useEffect(() => {
    if (open && compositionId) {
      if (initialMcpToolNames?.length) {
        setSelectedMcpToolNames(new Set(initialMcpToolNames));
      }
      if (initialNotificationOption && initialNotificationOption !== "none") {
        setNotificationOption(initialNotificationOption);
      }
    }
  }, [open, compositionId, initialMcpToolNames, initialNotificationOption]);

  /** 组合模式下 model_id、mcp_id、mcp_tool_names、邮件方式 已在编辑时配置，不允许修改 */
  const compositionConfigReadOnly = !!compositionId;

  /** 组合预览时，即使通知配置未加载完，也保持 initialNotificationOption 的显示（避免被 Picker 的 hasEmailConfig 重置逻辑覆盖） */
  const effectiveHasEmailConfig =
    notificationConfigs.length > 0 ||
    (!!compositionId && !!initialNotificationOption && initialNotificationOption !== "none");

  // 加载模型列表
  useEffect(() => {
    if (!open || !isMounted) return;

    const loadModels = async () => {
      try {
        setLoadingModels(true);
        const response = await getLLMModels({ limit: 500 });
        const items = response?.items ?? [];
        const activeModels = Array.isArray(items) ? items.filter((m: LLMModel) => m.is_active !== false) : [];
        setModels(activeModels);
        
        // 优先使用组合传入的 initialModelId，否则使用默认模型
        if (initialModelId && activeModels.some(m => m.id === initialModelId)) {
          setSelectedModelId(initialModelId);
        } else {
          const defaultModel = activeModels.find(m => m.is_default);
          if (defaultModel) {
            setSelectedModelId(defaultModel.id);
          }
        }
      } catch (error) {
        logger.error("加载模型列表失败", error);
      } finally {
        setLoadingModels(false);
      }
    };

    loadModels();
  }, [open, isMounted, initialModelId]);

  // 加载 MCP 配置列表
  useEffect(() => {
    if (!open || !isMounted) return;

    const loadMcps = async () => {
      try {
        setLoadingMcps(true);
        const response = await getMCPConfigsForDebug();
        setMcpConfigs(response.items);
        const validMcp =
          initialMcpId && response.items.some((m) => m.id === initialMcpId)
            ? initialMcpId
            : "__none__";
        setSelectedMcpId(validMcp);
        // 仅在没有组合预配置工具时清空本地选择；
        // 若来自组合预览（initialMcpToolNames 有值），则保留预选中的工具列表
        if (!compositionId || !initialMcpToolNames || initialMcpToolNames.length === 0) {
          setSelectedMcpToolNames(new Set());
        }
      } catch (error) {
        logger.error("加载 MCP 列表失败", error);
      } finally {
        setLoadingMcps(false);
      }
    };

    loadMcps();
  }, [open, isMounted, initialMcpId, compositionId, initialMcpToolNames]);

  // 复制 CURL 命令：统一用 /api 格式（供外部/业务调用），X-Team-AuthCode
  const handleCopyCurl = useCallback(async () => {
    if (!prompt) return;
    let url: string;
    if (compositionId && compositionPromptId) {
      const tenantId = editableTenantId || compositionTenantId || "";
      const path = debugMode === "chat" ? "llm" : "request";
      const base = API_BASE_URL?.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
      url = `${base}/api/compositions/${compositionId}/tenant/${tenantId}/prompt/${compositionPromptId}/${path}`;
    } else {
      url = apiUrl;
    }
    
    const requestBody: any = {};
    if (debugTenantCode?.trim()) {
      requestBody.tenantCode = debugTenantCode.trim();
    }
    if (Object.keys(debugPlaceholderParams).length > 0) {
      requestBody.additional_params = debugPlaceholderParams;
    }
    if (selectedModelId) {
      requestBody.model_id = selectedModelId;
    }
    if (selectedMcpId && selectedMcpId !== "__none__") {
      requestBody.mcp_id = selectedMcpId;
      if (selectedMcpToolNames.size > 0) {
        requestBody.mcp_tool_names = Array.from(selectedMcpToolNames);
      }
    }
    if (debugLLMConfig.temperature !== undefined || debugLLMConfig.max_tokens !== undefined) {
      requestBody.llm_config = {};
      if (debugLLMConfig.temperature !== undefined) {
        requestBody.llm_config.temperature = debugLLMConfig.temperature;
      }
      if (debugLLMConfig.max_tokens !== undefined) {
        requestBody.llm_config.max_tokens = debugLLMConfig.max_tokens;
      }
    }
    requestBody.user_message = input.trim() || "";
    if (debugMode === "api" && notificationOption !== "none" && notificationEmailTo?.trim()) {
      requestBody.notification = {
        type: "email",
        email_to: notificationEmailTo.trim(),
        email_content_type: toEmailContentType(notificationOption) ?? "html",
      };
    }

    const authHeader = `-H "X-Team-AuthCode: ${userStore.user?.team_authcode || "YOUR_TEAM_AUTHCODE"}"`;
    const curlCommand = `curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  ${authHeader} \\
  -d '${JSON.stringify(requestBody, null, 2)}'`;

    await copy(curlCommand);
  }, [prompt, apiUrl, compositionId, compositionPromptId, editableTenantId, compositionTenantId, debugMode, debugTenantCode, debugPlaceholderParams, debugLLMConfig, input, selectedModelId, selectedMcpId, selectedMcpToolNames, notificationOption, notificationEmailTo, copy]);

  // 重置状态
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      reset();
      setDebugTenantCode("");
      setDebugLLMConfig({ temperature: 0.3 });
      setSelectedModelId("");
      setDebugPlaceholderParams({});
      setDebugMode("chat");
      setIsRightPanelCollapsed(false);
      resetCopied();
      setOpenFilterPopover(null);
      setSelectedMcpId("__none__");
      setSelectedMcpToolNames(new Set());
      setNotificationOption("none");
      setNotificationEmailTo("");
      setHeadersExpanded(true);
      setBodyExpanded(true);
      setQueryExpanded(false);
      setEditableTenantId("");
      setRequestTab("body");
      setResponseText("");
    }
    onOpenChange(newOpen);
  }, [reset, onOpenChange, resetCopied]);

  // 响应区：API 返回时同步到 responseText，便于粘贴对比
  useEffect(() => {
    if (rawApiResponse != null) {
      setResponseText(JSON.stringify(rawApiResponse, null, 2));
    } else if (messages.filter((m) => m.role === "assistant").length > 0) {
      setResponseText(messages.filter((m) => m.role === "assistant").map((m) => m.content).join("\n\n"));
    }
  }, [rawApiResponse, messages]);

  // 接口模式下获取通知配置列表（用于邮件通知选项）
  useEffect(() => {
    if (!open || debugMode !== "api") return;
    setLoadingNotificationConfigs(true);
    getNotificationConfigsForDebug()
      .then(setNotificationConfigs)
      .catch(() => setNotificationConfigs([]))
      .finally(() => setLoadingNotificationConfigs(false));
  }, [open, debugMode]);

  /** 预览/组合模式下：模型、MCP、通知等固定配置只读；普通调试模式下可编辑 */
  const configReadOnly = previewMode || !!compositionId;
  const debugParamsEditable = true; // temperature、maxTokens、租户、占位符始终可调

  // 解析占位符详细信息（支持新格式），memo 避免重复计算；必须在 early return 之前调用，遵守 Hooks 规则
  const { parsedPlaceholders, inputPlaceholders, tablePlaceholders } = useMemo(() => {
    if (!prompt) {
      return { parsedPlaceholders: [], inputPlaceholders: [], tablePlaceholders: [] };
    }
    const contentPlaceholders = parsePlaceholdersFromText(prompt.content);
    const parsed = contentPlaceholders.map((ph) => {
      const details = parsePlaceholderDetails(`{${ph}}`);
      if (details) {
        const placeholderByKey = placeholders.find((p) => p.key === details.key);
        const placeholderByLabel = placeholders.find((p) => p.label === details.key);
        const placeholder = placeholderByKey || placeholderByLabel;
        let actualType = details.type;
        if (placeholder) {
          const dataSourceType = (placeholder as { data_source_type?: string }).data_source_type || "user_input";
          if (dataSourceType === "multi_dimension_table") {
            actualType = "table";
          } else {
            actualType = "input";
          }
        }
        return { ...details, type: actualType, placeholder };
      }
      return null;
    }).filter((p): p is NonNullable<typeof p> => p !== null);
    return {
      parsedPlaceholders: parsed,
      inputPlaceholders: parsed.filter((p) => p.type === "input"),
      tablePlaceholders: parsed.filter((p) => p.type === "table"),
    };
  }, [prompt, placeholders]);

  if (!prompt) return null;

  const needsTenant = checkIfTenantRequired(prompt.content, prompt.placeholders);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-lg flex items-center gap-2">
            {previewMode ? (
              <>
                {debugMode === "chat" ? (
                  <Communication className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <Api className="w-5 h-5 text-muted-foreground" />
                )}
                {compositionName || "组合"}
              </>
            ) : (
              `调试提示词 - ${getSceneLabel(prompt.scene)}`
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex gap-4 overflow-hidden px-6 pb-6 relative">
          {/* 左侧：LLM 聊天预览 或 接口 Postman 风格 */}
          <div className="flex-1 flex flex-col border rounded-xl overflow-hidden bg-gradient-to-b from-background to-muted/20 shadow-sm transition-all duration-300">
            {debugMode === "chat" ? (
              <>
                <PromptDebugChatView
                  messages={messages}
                  streaming={streaming}
                  messagesEndRef={chatMessagesEndRef}
                />
                <div className="border-t bg-background/50 backdrop-blur-sm p-4">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 relative">
                      <Textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                        placeholder="输入消息... (Shift+Enter 换行)"
                        className="min-h-[60px] max-h-[120px] resize-none pr-12"
                        disabled={streaming}
                      />
                      <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
                        {input.length > 0 && `${input.length} 字`}
                      </div>
                    </div>
                    <Button
                      onClick={sendMessage}
                      disabled={!input.trim() || streaming || !selectedModelId}
                      size="icon"
                      className="h-[60px] w-[60px] shrink-0"
                      title={!selectedModelId ? "请先选择模型" : undefined}
                    >
                      <Send className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <PromptDebugApiView
                apiUrl={apiUrl}
                prompt={prompt}
                streaming={streaming}
                previewMode={previewMode}
                input={input}
                onInputChange={setInput}
                onSend={sendMessage}
                onCopyCurl={handleCopyCurl}
                copiedCurl={copiedCurl}
                selectedModelId={selectedModelId}
                onSelectedModelIdChange={setSelectedModelId}
                requestTab={requestTab}
                onRequestTabChange={setRequestTab}
                responseText={responseText}
                onResponseTextChange={setResponseText}
                compositionId={compositionId}
                compositionPromptId={compositionPromptId}
                editableTenantId={editableTenantId}
                onEditableTenantIdChange={setEditableTenantId}
                tenants={tenants}
                compositionTenantId={compositionTenantId}
                needsTenant={needsTenant}
                debugTenantCode={debugTenantCode}
                onDebugTenantCodeChange={setDebugTenantCode}
                debugLLMConfig={debugLLMConfig}
                onDebugLLMConfigChange={setDebugLLMConfig}
                models={models}
                loadingModels={loadingModels}
                compositionConfigReadOnly={compositionConfigReadOnly}
                mcpConfigs={mcpConfigs}
                loadingMcps={loadingMcps}
                selectedMcpId={selectedMcpId}
                onSelectedMcpIdChange={setSelectedMcpId}
                selectedMcpToolNames={selectedMcpToolNames}
                onSelectedMcpToolNamesChange={setSelectedMcpToolNames}
                inputPlaceholders={inputPlaceholders}
                tablePlaceholders={tablePlaceholders}
                debugPlaceholderParams={debugPlaceholderParams}
                onDebugPlaceholderParamsChange={setDebugPlaceholderParams}
                tableInfoMap={tableInfoMap}
                loadingTables={loadingTables}
                openFilterPopover={openFilterPopover}
                onOpenFilterPopoverChange={setOpenFilterPopover}
                notificationOption={notificationOption}
                onNotificationOptionChange={(v) => {
                  setNotificationOption(v);
                  if (v === "none") setNotificationEmailTo("");
                }}
                notificationEmailTo={notificationEmailTo}
                onNotificationEmailToChange={setNotificationEmailTo}
                effectiveHasEmailConfig={effectiveHasEmailConfig}
                loadingNotificationConfigs={loadingNotificationConfigs}
              />
            )}
          </div>

          {/* 折叠按钮（仅聊天模式有右侧配置） */}
          {debugMode === "chat" && (
            <Button
              variant="outline"
              size="icon"
              className={`absolute h-8 w-8 rounded-full shadow-md bg-background border-2 hover:bg-background z-20 transition-all duration-300 ${
                isRightPanelCollapsed 
                  ? "right-6 top-1/2 -translate-y-1/2" 
                  : "right-[calc(20rem+1.5rem)] top-1/2 -translate-y-1/2"
              }`}
              onClick={() => setIsRightPanelCollapsed(!isRightPanelCollapsed)}
              title={isRightPanelCollapsed ? "展开配置" : "折叠配置"}
            >
              {isRightPanelCollapsed ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* 右侧：配置区域（仅聊天模式，接口模式参数均在 Body 中） */}
          {debugMode === "chat" && (
            <div
              className={`flex flex-col gap-4 transition-all duration-300 ${
                isRightPanelCollapsed ? "w-0 opacity-0 overflow-hidden" : "w-80 opacity-100"
              }`}
            >
              <PromptDebugParamsPanel
                configReadOnly={configReadOnly}
                debugMode={debugMode}
                onDebugModeChange={setDebugMode}
                streaming={streaming}
                prompt={prompt}
                onCopyCurl={handleCopyCurl}
                copiedCurl={copiedCurl}
                isMounted={isMounted}
                previewMode={previewMode}
                debugLLMConfig={debugLLMConfig}
                onDebugLLMConfigChange={setDebugLLMConfig}
                debugParamsEditable={debugParamsEditable}
                selectedModelId={selectedModelId}
                onSelectedModelIdChange={setSelectedModelId}
                models={models}
                loadingModels={loadingModels}
                mcpConfigs={mcpConfigs}
                loadingMcps={loadingMcps}
                selectedMcpId={selectedMcpId}
                onSelectedMcpIdChange={setSelectedMcpId}
                selectedMcpToolNames={selectedMcpToolNames}
                onSelectedMcpToolNamesChange={setSelectedMcpToolNames}
                needsTenant={needsTenant}
                debugTenantCode={debugTenantCode}
                onDebugTenantCodeChange={setDebugTenantCode}
                inputPlaceholders={inputPlaceholders}
                tablePlaceholders={tablePlaceholders}
                debugPlaceholderParams={debugPlaceholderParams}
                onDebugPlaceholderParamsChange={setDebugPlaceholderParams}
                tableInfoMap={tableInfoMap}
                loadingTables={loadingTables}
                openFilterPopover={openFilterPopover}
                onOpenFilterPopoverChange={setOpenFilterPopover}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
