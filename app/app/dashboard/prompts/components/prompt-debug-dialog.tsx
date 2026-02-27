"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Bot, Send, ChevronLeft, ChevronRight, Copy, Check, HelpCircle, Globe, Play, ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FieldHelp } from "@/components/ui/field-help";
import { ApiFieldLabel } from "@/components/shared/api-field-label";
import { ObjectFieldSection } from "@/components/shared/object-field-section";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePromptDebug } from "../hooks/use-prompt-debug";
import {
  parsePlaceholdersFromText,
  parsePlaceholderDetails,
  checkIfTenantRequired,
  isAutoFetchedPlaceholder,
  getSceneLabel,
} from "../utils/prompt-utils";
import type { Prompt, Placeholder, PromptScene } from "../prompts-client";
import type { LLMConfig } from "@/lib/api/llmchat";
import { API_BASE_URL, getAuthToken } from "@/lib/api/config";
import { logger } from "@/lib/utils/logger";
import { PlaceholderParamsPanel } from "./placeholders";
import { usePlaceholderTables } from "../hooks/use-placeholder-tables";
import { cn } from "@/lib/utils";
import { userStore } from "@/store/user-store";
import { getLLMModels, type LLMModel } from "@/lib/api/llm-models";
import { getMCPConfigsForDebug, type MCPConfig } from "@/lib/api/mcp";
import { getNotificationConfigsForDebug } from "@/lib/api/notification-config";
import { Checkbox } from "@/components/ui/checkbox";
import {
  NotificationOptionPicker,
  type NotificationOption,
  toEmailContentType,
} from "@/app/dashboard/compositions/components/notification-option-picker";

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
  const [debugPlaceholderParams, setDebugPlaceholderParams] = useState<Record<string, any>>({});
  const [debugMode, setDebugMode] = useState<"chat" | "api">("chat");
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
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
      return `${base}/api/compositions/${compositionId}/tenant/${tenantId}/prompt/${compositionPromptId}/${path}`;
    }
    const ep = debugMode === "chat" ? "chat" : "api";
    return `${base}/api/llmchat/prompts/${prompt?.scene}/${ep}`;
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
        const validMcp = initialMcpId && response.items.some(m => m.id === initialMcpId)
          ? initialMcpId
          : "__none__";
        setSelectedMcpId(validMcp);
        setSelectedMcpToolNames(new Set());
      } catch (error) {
        logger.error("加载 MCP 列表失败", error);
      } finally {
        setLoadingMcps(false);
      }
    };

    loadMcps();
  }, [open, isMounted, initialMcpId]);

  // 复制 CURL 命令（业务场景，使用团队认证码）
  const handleCopyCurl = useCallback(async () => {
    if (!prompt) return;
    const url = apiUrl;
    
    // 获取团队认证码（业务场景）
    const teamAuthcode = userStore.user?.team_authcode;
    
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

    // 生成业务场景的 CURL 命令（使用团队认证码）
    const curlCommand = `curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  ${teamAuthcode ? `-H "X-Team-AuthCode: ${teamAuthcode}" \\` : `-H "X-Team-AuthCode: YOUR_TEAM_AUTHCODE" \\`}
  -d '${JSON.stringify(requestBody, null, 2)}'`;

    try {
      await navigator.clipboard.writeText(curlCommand);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    } catch (error) {
      logger.error("复制失败", error);
    }
  }, [prompt, apiUrl, debugMode, debugTenantCode, debugPlaceholderParams, debugLLMConfig, input, selectedModelId, selectedMcpId, selectedMcpToolNames, notificationOption, notificationEmailTo]);

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
      setCopiedCurl(false);
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
  }, [reset, onOpenChange]);

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

  if (!prompt) return null;

  /** 预览模式下：模型、MCP、通知等固定配置只读；temperature、maxTokens、租户、占位符等可调试 */
  const configReadOnly = true;
  const debugParamsEditable = true; // temperature、maxTokens、租户、占位符始终可调

  const needsTenant = checkIfTenantRequired(prompt.content, prompt.placeholders);
  const contentPlaceholders = parsePlaceholdersFromText(prompt.content);
  
  // 解析占位符详细信息（支持新格式）
  const parsedPlaceholders = contentPlaceholders.map(ph => {
    const details = parsePlaceholderDetails(`{${ph}}`);
    if (details) {
      // 根据 key 或 label 查找占位符定义
      const placeholderByKey = placeholders.find((p) => p.key === details.key);
      const placeholderByLabel = placeholders.find((p) => p.label === details.key);
      const placeholder = placeholderByKey || placeholderByLabel;
      
      // 根据占位符配置确定类型（新格式：{key} 的类型由配置决定）
      let actualType = details.type;
      if (placeholder) {
        const dataSourceType = (placeholder as any).data_source_type || "user_input";
        if (dataSourceType === "multi_dimension_table") {
          actualType = "table";
        } else {
          actualType = "input";
        }
      }
      
      return {
        ...details,
        type: actualType,
        placeholder,
      };
    }
    return null;
  }).filter((p): p is NonNullable<typeof p> => p !== null);

  // 在调试模式下，所有占位符都应该显示输入框
  // 对于 input 类型，显示值输入框
  // 对于 table 类型，显示 row_id 输入框
  const inputPlaceholders = parsedPlaceholders.filter(p => p.type === "input");
  const tablePlaceholders = parsedPlaceholders.filter(p => p.type === "table");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-lg flex items-center gap-2">
            {previewMode ? (
              <>
                <Globe className="w-5 h-5 text-muted-foreground" />
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
                {/* LLM 模式：聊天预览 + 底部输入 */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <Bot className="w-8 h-8 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">聊天预览</h3>
                    </div>
                  ) : (
                    <>
                      {messages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex items-start ${
                            msg.role === "user" ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className={`flex flex-col gap-1 ${
                              msg.role === "user" ? "max-w-[75%] items-end" : "max-w-[85%] items-start"
                            }`}
                          >
                            <div
                              className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                                msg.role === "user"
                                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                                  : "bg-background border rounded-tl-sm"
                              }`}
                            >
                              {msg.role === "assistant" ? (
                                <div className="markdown-content">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeHighlight]}
                                  >
                                    {msg.content}
                                  </ReactMarkdown>
                                </div>
                              ) : (
                                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                                  {msg.content}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {streaming && (
                        <div className="flex items-start">
                          <div className="flex flex-col gap-1 max-w-[85%] items-start">
                            <div className="bg-background border rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
                              <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                  <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                  <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                  <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                </div>
                                <span className="text-xs text-muted-foreground ml-1">AI 正在思考...</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={chatMessagesEndRef} />
                    </>
                  )}
                </div>
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
              <>
                {/* 接口模式：Postman 风格，参考图布局 */}
                <div className="flex-1 flex flex-col overflow-hidden bg-background">
                  {/* 顶部：方法 + URL + 发送 */}
                  <div className="border-b px-4 py-3 flex items-center gap-2 bg-muted/20">
                    <Badge variant="secondary" className="font-mono text-xs shrink-0 bg-emerald-500/20 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-400 border-emerald-500/30">
                      POST
                    </Badge>
                    <Input
                      value={apiUrl}
                      readOnly
                      disabled={previewMode}
                      className="flex-1 h-9 text-sm font-mono bg-muted/50 border-muted-foreground/20 cursor-not-allowed"
                    />
                    <Button
                      size="sm"
                      onClick={sendMessage}
                      disabled={!input.trim() || streaming || !selectedModelId}
                      className="shrink-0 bg-primary hover:bg-primary/90"
                      title={!selectedModelId ? "请先选择模型" : undefined}
                    >
                      <Send className="h-4 w-4 mr-1.5" />
                      发送
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyCurl}
                      disabled={!prompt || streaming}
                      className="shrink-0"
                    >
                      {copiedCurl ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                      {copiedCurl ? "已复制" : "CURL"}
                    </Button>
                  </div>
                  {/* Tab 栏 */}
                  <div className="flex border-b bg-muted/10">
                    {(["params", "body", "headers"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setRequestTab(tab)}
                        className={cn(
                          "px-4 py-2.5 text-sm font-medium transition-colors",
                          requestTab === tab
                            ? "text-primary border-b-2 border-primary bg-background"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {tab === "params" && "Query 参数 / Path 参数"}
                        {tab === "body" && "Body（JSON）"}
                        {tab === "headers" && "请求头"}
                      </button>
                    ))}
                  </div>
                  {/* Tab 内容 + 响应：Tab 内容可滚动，响应固定底部不随 Tab 切换 */}
                  <div className="flex-1 flex flex-col min-h-0 gap-0">
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-0">
                    {requestTab === "params" && (
                      <div className="space-y-3">
                        {compositionId && compositionPromptId ? (
                          <div className="rounded border overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b bg-muted/30">
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">参数名</th>
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">参数值</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-b">
                                  <td className="px-3 py-2 font-mono text-xs">compositionId</td>
                                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground truncate">{compositionId}</td>
                                </tr>
                                <tr className="border-b">
                                  <td className="px-3 py-2 font-mono text-xs">tenantId</td>
                                  <td className="px-3 py-2">
                                    <Select
                                      value={editableTenantId || "default"}
                                      onValueChange={setEditableTenantId}
                                      disabled={streaming}
                                    >
                                      <SelectTrigger className="h-8 text-xs font-mono w-full">
                                        <SelectValue placeholder="选择租户" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="default">默认</SelectItem>
                                        {tenants.map((t) => (
                                          <SelectItem key={t.id} value={t.id}>
                                            {t.name || t.code_id}
                                          </SelectItem>
                                        ))}
                                        {compositionTenantId && compositionTenantId !== "default" && !tenants.some((t) => t.id === compositionTenantId) && (
                                          <SelectItem value={compositionTenantId}>
                                            {compositionTenantId}
                                          </SelectItem>
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </td>
                                </tr>
                                <tr className="border-b last:border-0">
                                  <td className="px-3 py-2 font-mono text-xs">promptId</td>
                                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground truncate">{compositionPromptId}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground py-4">本接口无 Query 参数</p>
                        )}
                      </div>
                    )}
                    {requestTab === "headers" && (
                      <div className="space-y-3">
                        <div className="rounded border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">参数名</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">参数值</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b last:border-0">
                                <td className="px-3 py-2 font-mono text-xs">Content-Type</td>
                                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">application/json</td>
                              </tr>
                              <tr className="border-b last:border-0">
                                <td className="px-3 py-2 font-mono text-xs">X-Team-AuthCode</td>
                                <td className="px-3 py-2 font-mono text-xs text-muted-foreground truncate" title={userStore.user?.team_authcode ?? ""}>
                                  {userStore.user?.team_authcode ? "***" : "（未设置）"}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {requestTab === "body" && (
                        <div className="space-y-5">
                            {/* 请求参数 */}
                            <div className="border rounded-lg p-4 space-y-4 bg-card shadow-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-1 h-4 bg-primary rounded-full" />
                                <h3 className="font-semibold text-sm font-mono">请求参数</h3>
                                <FieldHelp content="必填与可选参数。" />
                              </div>
                              <div className="pl-4 border-l-2 border-muted-foreground/30 space-y-4">
                            <div className="space-y-1.5">
                              <ApiFieldLabel keyName="user_message" help="用户消息内容，必填。将作为提示词中的用户输入部分。" typeBadge="string" required htmlFor="api-user-message" />
                              <Textarea
                                id="api-user-message"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="用户消息内容"
                                className="min-h-[72px] text-sm resize-none font-mono"
                                disabled={streaming}
                              />
                            </div>
                            {!compositionId && needsTenant && (
                              <div className="space-y-1.5">
                                <ApiFieldLabel keyName="tenantCode" help="租户编号，可选。用于多租户场景下的租户隔离。" typeBadge="string" optional htmlFor="api-tenant" />
                                <Input
                                  id="api-tenant"
                                  value={debugTenantCode}
                                  onChange={(e) => setDebugTenantCode(e.target.value)}
                                  placeholder="租户编号"
                                  className="h-9 text-sm font-mono"
                                  disabled={streaming}
                                />
                              </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <ApiFieldLabel keyName="model_id" help="LLM 模型 ID，必填。将作为提示词调用的语言模型。" typeBadge="string" required htmlFor="api-model" />
                                <Select
                                  value={selectedModelId}
                                  onValueChange={setSelectedModelId}
                                  disabled={streaming || loadingModels || compositionConfigReadOnly}
                                >
                                  <SelectTrigger id="api-model" className="h-9 text-sm w-full">
                                    <SelectValue placeholder={loadingModels ? "加载中..." : "请选择模型"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {models.map((m) => (
                                      <SelectItem key={m.id} value={m.id}>{m.id}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <ApiFieldLabel keyName="mcp_id" help="MCP 配置 ID，可选。用于启用 MCP 工具调用。" typeBadge="string" optional htmlFor="api-mcp" />
                                <Select
                                  value={selectedMcpId}
                                  onValueChange={(id) => {
                                    setSelectedMcpId(id);
                                    const mcp = id && id !== "__none__" ? mcpConfigs.find((c) => c.id === id) : null;
                                    if (mcp?.tools_cache?.length) {
                                      setSelectedMcpToolNames(new Set(mcp.tools_cache.map((t) => t.name)));
                                    } else {
                                      setSelectedMcpToolNames(new Set());
                                    }
                                  }}
                                  disabled={streaming || loadingMcps || compositionConfigReadOnly}
                                >
                                  <SelectTrigger id="api-mcp" className="h-9 text-sm w-full">
                                    <SelectValue placeholder={loadingMcps ? "加载中..." : "不选择"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">不选择</SelectItem>
                                    {mcpConfigs.map((mcp) => (
                                      <SelectItem key={mcp.id} value={mcp.id}>
                                        {mcp.id}
                                        {mcp.tools_cache?.length ? ` (${mcp.tools_cache.length} 个工具)` : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          {selectedMcpId && selectedMcpId !== "__none__" && (
                            <div className="space-y-3">
                              <ApiFieldLabel keyName="mcp_tool_names" help="MCP 工具名称列表。可多选要启用的工具。" typeBadge="string[]" />
                              <div className="max-h-24 overflow-y-auto space-y-2 rounded border p-3 custom-scrollbar">
                                {mcpConfigs.find((c) => c.id === selectedMcpId)?.tools_cache?.map((tool) => (
                                  <div key={tool.name} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`api-mcp-tool-${tool.name}`}
                                      checked={selectedMcpToolNames.has(tool.name)}
                                      onCheckedChange={(checked) => {
                                        setSelectedMcpToolNames((prev) => {
                                          const next = new Set(prev);
                                          if (checked) next.add(tool.name);
                                          else next.delete(tool.name);
                                          return next;
                                        });
                                      }}
                                      disabled={streaming || compositionConfigReadOnly}
                                    />
                                    <label htmlFor={`api-mcp-tool-${tool.name}`} className="text-sm cursor-pointer">{tool.title || tool.name}</label>
                                  </div>
                                )) ?? (
                                  <div className="text-sm text-muted-foreground">该 MCP 暂无工具</div>
                                )}
                              </div>
                            </div>
                          )}
                              </div>
                            </div>
                          <ObjectFieldSection title="llm_config" help="LLM 模型参数。temperature 控制随机性；max_tokens 限制最大输出长度。" grid>
                                <div className="space-y-1.5">
                                  <ApiFieldLabel keyName="temperature" typeBadge="number" nested htmlFor="api-llm-temp" />
                                  <Input
                                    id="api-llm-temp"
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="2"
                                    value={debugLLMConfig.temperature ?? 0.3}
                                    onChange={(e) => setDebugLLMConfig({ ...debugLLMConfig, temperature: parseFloat(e.target.value) || 0.3 })}
                                    className="h-9 text-sm font-mono"
                                    disabled={streaming}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <ApiFieldLabel keyName="max_tokens" typeBadge="number" nested htmlFor="api-llm-tokens" />
                                  <Input
                                    id="api-llm-tokens"
                                    type="number"
                                    min="1"
                                    value={debugLLMConfig.max_tokens ?? ""}
                                    onChange={(e) => setDebugLLMConfig({ ...debugLLMConfig, max_tokens: e.target.value ? parseInt(e.target.value) : undefined })}
                                    placeholder="留空不限制"
                                    className="h-9 text-sm font-mono"
                                    disabled={streaming}
                                  />
                                </div>
                          </ObjectFieldSection>
                          <ObjectFieldSection title="additional_params" help="占位符参数。根据提示词中的占位符动态生成，用于替换提示词中的变量。" grid>
                            {(inputPlaceholders.length > 0 || tablePlaceholders.length > 0) ? (
                              <PlaceholderParamsPanel
                                variant="api"
                                needsTenant={!compositionId && needsTenant}
                                tenantValue={debugTenantCode}
                                onTenantChange={setDebugTenantCode}
                                inputPlaceholders={inputPlaceholders}
                                tablePlaceholders={tablePlaceholders}
                                params={debugPlaceholderParams}
                                onParamsChange={setDebugPlaceholderParams}
                                tableInfoMap={tableInfoMap}
                                loadingTables={loadingTables}
                                openFilterPopover={openFilterPopover}
                                onOpenFilterPopoverChange={setOpenFilterPopover}
                                disabled={streaming}
                                idPrefix="api-param"
                                asGridItems
                              />
                            ) : (
                              <div className="sm:col-span-2">
                                <pre className="text-xs font-mono bg-muted/50 rounded p-3">{JSON.stringify(debugPlaceholderParams, null, 2) || "{}"}</pre>
                              </div>
                            )}
                          </ObjectFieldSection>
                          <ObjectFieldSection title="notification" help="通知配置。异步任务完成后可选择邮件等方式通知。" grid>
                                <div className="space-y-1.5">
                                  <ApiFieldLabel keyName="type" typeBadge="string" nested badgeVariant="outline" />
                                  <NotificationOptionPicker
                                    value={notificationOption}
                                    onChange={(v) => { setNotificationOption(v); if (v === "none") setNotificationEmailTo(""); }}
                                    hasEmailConfig={effectiveHasEmailConfig}
                                    disabled={streaming || loadingNotificationConfigs || compositionConfigReadOnly}
                                  />
                                </div>
                                {notificationOption !== "none" && (
                                  <>
                                    <div className="space-y-1.5">
                                      <ApiFieldLabel keyName="email_to" typeBadge="string" nested badgeVariant="outline" htmlFor="api-notification-email" />
                                      <Input
                                        id="api-notification-email"
                                        type="email"
                                        placeholder="收件人邮箱"
                                        value={notificationEmailTo}
                                        onChange={(e) => setNotificationEmailTo(e.target.value)}
                                        className="h-9 text-sm font-mono"
                                        disabled={streaming}
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <ApiFieldLabel keyName="email_content_type" typeBadge="string" nested badgeVariant="outline" />
                                      <Select
                                        value={toEmailContentType(notificationOption) ?? "html"}
                                        onValueChange={(v) => setNotificationOption(`email:${v}` as NotificationOption)}
                                        disabled={streaming || compositionConfigReadOnly}
                                      >
                                        <SelectTrigger className="h-9 text-sm font-mono w-full">
                                          <SelectValue placeholder="选择格式" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="html">html</SelectItem>
                                          <SelectItem value="plain">plain</SelectItem>
                                          <SelectItem value="file">file</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </>
                                )}
                          </ObjectFieldSection>
                        </div>
                    )}
                    </div>
                    {/* 响应区：可粘贴编辑，便于调试对比 */}
                    <div className="shrink-0 border-t p-4 bg-muted/5">
                      <Label className="text-sm font-medium">响应</Label>
                      <div className="mt-2 relative">
                        {streaming && (
                          <div className="absolute top-2 right-2 flex items-center gap-2 text-muted-foreground z-10">
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                              <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                              <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                            <span className="text-xs">请求中...</span>
                          </div>
                        )}
                        <Textarea
                          value={responseText}
                          onChange={(e) => setResponseText(e.target.value)}
                          placeholder="发送请求后在此显示响应，或粘贴 JSON 进行对比调试"
                          className="min-h-[120px] max-h-[240px] text-xs font-mono resize-none bg-muted/30 border rounded-lg p-4 pr-24"
                          readOnly={streaming}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
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
          <div className={`flex flex-col gap-4 overflow-y-auto pr-1 transition-all duration-300 custom-scrollbar ${
            isRightPanelCollapsed ? "w-0 opacity-0 overflow-hidden" : "w-80 opacity-100"
          }`}>
            {/* 调试配置（预览模式下不展示） */}
            {!previewMode && (
            <div className="border rounded-lg p-4 space-y-4 bg-card shadow-sm">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-primary rounded-full" />
                <h3 className="font-semibold text-sm">调试配置</h3>
                {configReadOnly && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">配置只读，参数可调</Badge>
                )}
              </div>
              <div className="space-y-3">
                {!previewMode && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="debug-mode" className="text-sm cursor-pointer">
                      调试模式
                    </Label>
                    {isMounted && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              disabled={streaming}
                            >
                              <HelpCircle className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <div className="space-y-2 text-sm">
                              <div>
                                <strong>聊天模式：</strong>使用 SSE 流式响应，实时显示 AI 回复
                              </div>
                              <div>
                                <strong>接口模式：</strong>使用 HTTP 请求，等待完整回复后一次性显示
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={debugMode === "chat" ? "default" : "secondary"} className="text-xs">
                      {debugMode === "chat" ? "聊天模式" : "接口模式"}
                    </Badge>
                    <Switch
                      id="debug-mode"
                      checked={debugMode === "chat"}
                      onCheckedChange={(checked) => setDebugMode(checked ? "chat" : "api")}
                      disabled={streaming || configReadOnly}
                    />
                  </div>
                </div>
                )}
                {!previewMode && (
                  <div className="pt-2 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleCopyCurl}
                      disabled={!prompt || streaming}
                    >
                      {copiedCurl ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          已复制
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          复制 CURL 命令
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            )}

            {/* LLM 配置 */}
            <div className="border rounded-lg p-4 space-y-4 bg-card shadow-sm">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-primary rounded-full" />
                <h3 className="font-semibold text-sm font-mono">llm_config</h3>
                <FieldHelp content="LLM 模型参数配置。" />
                <Badge variant="secondary" className="text-xs">object</Badge>
              </div>
              <div className="pl-4 border-l-2 border-muted-foreground/30 space-y-3">
                <div className="space-y-2">
                  <ApiFieldLabel keyName="model_id" help="LLM 模型 ID，必填。" typeBadge="string" nested badgeVariant="outline" required htmlFor="debug-model" />
                  <Select
                    value={selectedModelId}
                    onValueChange={setSelectedModelId}
                    disabled={streaming || loadingModels || configReadOnly}
                    required
                  >
                    <SelectTrigger id="debug-model" className="w-full">
                      <SelectValue placeholder={loadingModels ? "加载中..." : "请选择模型"} />
                    </SelectTrigger>
                    <SelectContent>
                      {models.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          {loadingModels ? "加载中..." : "暂无可用模型"}
                        </div>
                      ) : (
                        models.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.name ?? model.model ?? model.id}
                            {model.is_default && " [默认]"}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <ApiFieldLabel keyName="temperature" help="控制输出随机性，0-2，越小越确定。" typeBadge="number" nested badgeVariant="outline" htmlFor="debug-temperature" />
                  <Input
                    id="debug-temperature"
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={debugLLMConfig.temperature ?? 0.3}
                    onChange={(e) =>
                      setDebugLLMConfig({
                        ...debugLLMConfig,
                        temperature: parseFloat(e.target.value) || 0.3,
                      })
                    }
                    disabled={!debugParamsEditable}
                  />
                </div>
                <div className="space-y-2">
                  <ApiFieldLabel keyName="max_tokens" help="限制模型最大输出 token 数，可选。留空则不限制。" typeBadge="number" nested badgeVariant="outline" htmlFor="debug-max-tokens" />
                  <Input
                    id="debug-max-tokens"
                    type="number"
                    min="1"
                    value={debugLLMConfig.max_tokens ?? ""}
                    onChange={(e) =>
                      setDebugLLMConfig({
                        ...debugLLMConfig,
                        max_tokens: e.target.value ? parseInt(e.target.value) : undefined,
                      })
                    }
                    placeholder="留空则不限制"
                    disabled={!debugParamsEditable}
                  />
                </div>
              </div>
            </div>

            {/* MCP 配置（预览模式下不展示） */}
            {!previewMode && (
            <div className="border rounded-lg p-4 space-y-4 bg-card shadow-sm">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-primary rounded-full" />
                <h3 className="font-semibold text-sm">MCP 服务</h3>
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="debug-mcp">选择 MCP 服务</Label>
                  <Select
                    value={selectedMcpId}
                    onValueChange={(id) => {
                      setSelectedMcpId(id);
                      const mcp = id && id !== "__none__" ? mcpConfigs.find((c) => c.id === id) : null;
                      if (mcp?.tools_cache?.length) {
                        setSelectedMcpToolNames(new Set(mcp.tools_cache.map((t) => t.name)));
                      } else {
                        setSelectedMcpToolNames(new Set());
                      }
                    }}
                    disabled={streaming || loadingMcps || configReadOnly}
                  >
                    <SelectTrigger id="debug-mcp" className="w-full">
                      <SelectValue placeholder={loadingMcps ? "加载中..." : "不选择（默认）"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">不选择</SelectItem>
                      {mcpConfigs.map((mcp) => (
                        <SelectItem key={mcp.id} value={mcp.id}>
                          {mcp.id}
                          {mcp.tools_cache?.length ? ` (${mcp.tools_cache.length} 个工具)` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedMcpId && selectedMcpId !== "__none__" && (
                  <div className="space-y-2">
                    <Label>勾选可用的 MCP 工具（子功能）</Label>
                    <div className="max-h-32 overflow-y-auto space-y-2 rounded border p-2 custom-scrollbar">
                      {mcpConfigs
                        .find((c) => c.id === selectedMcpId)
                        ?.tools_cache?.map((tool) => (
                          <div key={tool.name} className="flex items-center space-x-2">
                            <Checkbox
                              id={`mcp-tool-${tool.name}`}
                              checked={selectedMcpToolNames.has(tool.name)}
                              onCheckedChange={(checked) => {
                                setSelectedMcpToolNames((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(tool.name);
                                  else next.delete(tool.name);
                                  return next;
                                });
                              }}
                              disabled={configReadOnly}
                            />
                            <label
                              htmlFor={`mcp-tool-${tool.name}`}
                              className="text-sm cursor-pointer flex-1"
                            >
                              {tool.title || tool.name}
                            </label>
                          </div>
                        )) ?? (
                        <div className="text-sm text-muted-foreground">该 MCP 暂无工具</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            )}

            {/* additional_params */}
            <div className="border rounded-lg p-4 space-y-4 bg-card shadow-sm">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-primary rounded-full" />
                <h3 className="font-semibold text-sm font-mono">additional_params</h3>
                <FieldHelp content="占位符参数。根据提示词中的占位符动态生成，用于替换提示词中的变量。" />
                <Badge variant="secondary" className="text-xs">object</Badge>
              </div>
              <div className="pl-4 border-l-2 border-muted-foreground/30 space-y-3">
                <PlaceholderParamsPanel
                  variant="chat"
                  needsTenant={needsTenant}
                  tenantValue={debugTenantCode}
                  onTenantChange={setDebugTenantCode}
                  inputPlaceholders={inputPlaceholders}
                  tablePlaceholders={tablePlaceholders}
                  params={debugPlaceholderParams}
                  onParamsChange={setDebugPlaceholderParams}
                  tableInfoMap={tableInfoMap}
                  loadingTables={loadingTables}
                  openFilterPopover={openFilterPopover}
                  onOpenFilterPopoverChange={setOpenFilterPopover}
                  disabled={!debugParamsEditable}
                  idPrefix="debug"
                />
              </div>
            </div>

            {/* 复制 CURL（置底） */}
            <div className="mt-auto pt-4">
              <Button
                type="button"
                size="sm"
                className="w-full bg-black text-white hover:bg-black/90 disabled:opacity-50"
                onClick={handleCopyCurl}
                disabled={!prompt || streaming}
              >
                {copiedCurl ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    复制 CURL 命令
                  </>
                )}
              </Button>
            </div>
          </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
