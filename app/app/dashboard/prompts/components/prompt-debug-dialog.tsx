"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Bot, Send, ChevronLeft, ChevronRight, Copy, Check, HelpCircle } from "lucide-react";
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
import { getTable, type MultiDimensionTable, type TableColumn } from "@/lib/api/multi-dimension-tables";
import { cn } from "@/lib/utils";
import { userStore } from "@/store/user-store";
import { getLLMModels, type LLMModel } from "@/lib/api/llm-models";

interface PromptDebugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: Prompt | null;
  tenants: Array<{ id: string; code_id: string; name: string }>;
  placeholders: Placeholder[];
  isMounted: boolean;
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
  // 存储表格信息：key 为 table_id，value 为表格对象
  const [tableInfoMap, setTableInfoMap] = useState<Record<string, MultiDimensionTable>>({});
  const [loadingTables, setLoadingTables] = useState<Record<string, boolean>>({});
  const loadedTableIdsRef = useRef<Set<string>>(new Set());
  // 跟踪哪个占位符的筛选弹出框是打开的
  const [openFilterPopover, setOpenFilterPopover] = useState<string | null>(null);

  const {
    messages,
    input,
    streaming,
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
  });

  // 加载模型列表
  useEffect(() => {
    if (!open || !isMounted) return;

    const loadModels = async () => {
      try {
        setLoadingModels(true);
        const response = await getLLMModels({ limit: 1000 });
        // 只显示激活的模型
        const activeModels = response.items.filter(m => m.is_active);
        setModels(activeModels);
        
        // 如果有默认模型，自动选择
        const defaultModel = activeModels.find(m => m.is_default);
        if (defaultModel) {
          setSelectedModelId(defaultModel.id);
        }
        // 如果没有默认模型，不自动选择，用户必须手动选择
      } catch (error) {
        logger.error("加载模型列表失败", error);
      } finally {
        setLoadingModels(false);
      }
    };

    loadModels();
  }, [open, isMounted]);

  // 复制 CURL 命令（业务场景，使用团队认证码）
  const handleCopyCurl = useCallback(async () => {
    if (!prompt) return;

    // 构建完整的 URL（包含域名）
    // 如果 API_BASE_URL 为空，使用当前页面的域名（通过 Nginx 或 rewrites 代理）
    let baseUrl = API_BASE_URL.replace(/\/$/, "");
    if (!baseUrl) {
      // 使用当前页面的域名，确保 CURL 命令包含完整地址
      baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    }
    
    const endpoint = debugMode === "chat" 
      ? `/api/llmchat/prompts/${prompt.scene}/chat`
      : `/api/llmchat/prompts/${prompt.scene}/api`;
    const url = `${baseUrl}${endpoint}`;
    
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
  }, [prompt, debugMode, debugTenantCode, debugPlaceholderParams, debugLLMConfig, input]);

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
      setTableInfoMap({});
      setLoadingTables({});
      loadedTableIdsRef.current.clear();
      setOpenFilterPopover(null);
    }
    onOpenChange(newOpen);
  }, [reset, onOpenChange]);

  // 获取多维表格信息
  useEffect(() => {
    if (!open || !prompt) return;

    const tablePlaceholders = placeholders.filter(
      (p) => p.data_source_type === "multi_dimension_table" && p.table_id
    );

    const fetchTables = async () => {
      for (const placeholder of tablePlaceholders) {
        if (!placeholder.table_id) continue;
        
        // 如果已经加载过，跳过
        if (loadedTableIdsRef.current.has(placeholder.table_id)) {
          continue;
        }

        // 标记为正在加载
        setLoadingTables((prev) => ({ ...prev, [placeholder.table_id!]: true }));

        try {
          const table = await getTable(placeholder.table_id!);
          setTableInfoMap((prev) => ({ ...prev, [placeholder.table_id!]: table }));
          loadedTableIdsRef.current.add(placeholder.table_id!);
        } catch (error) {
          logger.error(`获取表格信息失败: ${placeholder.table_id}`, error);
        } finally {
          setLoadingTables((prev => {
            const newState = { ...prev };
            delete newState[placeholder.table_id!];
            return newState;
          }));
        }
      }
    };

    fetchTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prompt?.scene, placeholders.map(p => `${p.key}-${p.table_id}`).join(",")]);

  if (!prompt) return null;

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
          <DialogTitle className="text-lg">
            调试提示词 - {getSceneLabel(prompt.scene)}
          </DialogTitle>
          <DialogDescription className="text-sm">
            测试提示词的效果，支持 SSE 流式响应
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex gap-4 overflow-hidden px-6 pb-6 relative">
          {/* 左侧：聊天内容 */}
          <div className="flex-1 flex flex-col border rounded-xl overflow-hidden bg-gradient-to-b from-background to-muted/20 shadow-sm transition-all duration-300">
            {/* 聊天消息区域 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Bot className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">开始对话</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    输入消息来测试提示词的效果，支持聊天模式（流式）和接口模式（HTTP）
                  </p>
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

            {/* 输入区域 */}
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
          </div>

          {/* 折叠按钮 */}
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

          {/* 右侧：配置区域 */}
          <div className={`flex flex-col gap-4 overflow-y-auto pr-1 transition-all duration-300 custom-scrollbar ${
            isRightPanelCollapsed ? "w-0 opacity-0 overflow-hidden" : "w-80 opacity-100"
          }`}>
            {/* 调试配置 */}
            <div className="border rounded-lg p-4 space-y-4 bg-card shadow-sm">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-primary rounded-full" />
                <h3 className="font-semibold text-sm">调试配置</h3>
              </div>
              <div className="space-y-3">
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
                      disabled={streaming}
                    />
                  </div>
                </div>
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
              </div>
            </div>

            {/* LLM 配置 */}
            <div className="border rounded-lg p-4 space-y-4 bg-card shadow-sm">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-primary rounded-full" />
                <h3 className="font-semibold text-sm">LLM 配置</h3>
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="debug-model">
                    模型选择 <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={selectedModelId}
                    onValueChange={setSelectedModelId}
                    disabled={streaming || loadingModels}
                    required
                  >
                    <SelectTrigger id="debug-model">
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
                            {model.name}
                            {model.is_default && " [默认]"}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debug-temperature">Temperature</Label>
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debug-max-tokens">Max Tokens (可选)</Label>
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
                  />
                </div>
              </div>
            </div>

            {/* 占位符配置 */}
            <div className="border rounded-lg p-4 space-y-4 bg-card shadow-sm">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-primary rounded-full" />
                <h3 className="font-semibold text-sm">占位符参数</h3>
              </div>
              <div className="space-y-3">
                {needsTenant && (
                  <div className="space-y-2">
                    <Label htmlFor="debug-tenant-code">
                      租户编号 <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="debug-tenant-code"
                      value={debugTenantCode}
                      onChange={(e) => setDebugTenantCode(e.target.value)}
                      placeholder="输入租户编号"
                      required
                    />
                  </div>
                )}
                {/* 用户输入类型占位符 */}
                {inputPlaceholders.length > 0 && (
                  <div className="space-y-2">
                    <Label>用户输入占位符</Label>
                    {inputPlaceholders.map((parsed) => {
                      const placeholder = parsed.placeholder;
                      const paramKey = placeholder?.key || parsed.key;
                      
                      // 用户输入类型：使用嵌套对象格式 {key: {value: "xxx"}}
                      const currentValue = 
                        (debugPlaceholderParams[paramKey] && typeof debugPlaceholderParams[paramKey] === "object")
                          ? debugPlaceholderParams[paramKey].value || ""
                          : "";
                      
                      return (
                        <div key={parsed.originalText} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`input-${paramKey}`} className="text-xs">
                              {placeholder?.label || parsed.key}
                            </Label>
                            <Badge variant="outline" className="text-xs">
                              输入
                            </Badge>
                          </div>
                          <Input
                            id={`input-${paramKey}`}
                            value={currentValue}
                            onChange={(e) => {
                              const value = e.target.value;
                              // 嵌套对象格式：{key: {value: "xxx"}}
                              setDebugPlaceholderParams({
                                ...debugPlaceholderParams,
                                [paramKey]: {
                                  ...(debugPlaceholderParams[paramKey] && typeof debugPlaceholderParams[paramKey] === "object" 
                                    ? debugPlaceholderParams[paramKey] 
                                    : {}),
                                  value: value,
                                },
                              });
                            }}
                            placeholder={`输入 ${placeholder?.label || parsed.key} 的值`}
                            className="text-sm"
                          />
                          {placeholder?.description && (
                            <p className="text-xs text-muted-foreground">
                              {placeholder.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* 多维表格类型占位符 */}
                {tablePlaceholders.length > 0 && (
                  <div className="space-y-2">
                    <Label>多维表格占位符</Label>
                    {tablePlaceholders.map((parsed) => {
                      const placeholder = parsed.placeholder;
                      const paramKey = placeholder?.key || parsed.key;
                      const tableId = placeholder?.table_id;
                      const targetColumnKey = placeholder?.table_column_key;
                      
                      // 获取表格信息
                      const table = tableId ? tableInfoMap[tableId] : null;
                      const isLoadingTable = tableId ? loadingTables[tableId] : false;
                      
                      // 获取可用列（排除目标列）
                      const tableColumns: TableColumn[] = table?.columns?.filter(
                        (col) => col.key !== targetColumnKey
                      ) || [];
                      
                      // 添加 row_id 作为额外的条件选项
                      const availableColumns: Array<TableColumn & { key: string; label: string }> = [
                        { key: "row_id", label: "行ID (row_id)", type: "number" },
                        ...tableColumns,
                      ];
                      
                      // 获取当前选择的条件字段和值
                      const currentParams = debugPlaceholderParams[paramKey];
                      // 获取第一个有值的字段，如果没有有值的，就获取第一个字段（即使值为空）
                      const currentConditionKey = 
                        (currentParams && typeof currentParams === "object")
                          ? Object.keys(currentParams).find(key => currentParams[key] !== undefined && currentParams[key] !== "") 
                            || Object.keys(currentParams)[0] 
                            || ""
                          : "";
                      const currentValue = 
                        (currentParams && typeof currentParams === "object" && currentConditionKey)
                          ? currentParams[currentConditionKey] || ""
                          : "";
                      
                      // 构建显示文本：如果有选择的条件且有值，显示"列名: 值"，如果只有字段没有值，显示"列名: (未输入)"
                      const displayText = currentConditionKey
                        ? currentValue
                          ? `${availableColumns.find(col => col.key === currentConditionKey)?.label || currentConditionKey}: ${currentValue}`
                          : `${availableColumns.find(col => col.key === currentConditionKey)?.label || currentConditionKey}: (未输入)`
                        : "点击设置筛选条件";
                      
                      return (
                        <div key={parsed.originalText} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`table-${paramKey}`} className="text-xs font-medium">
                              {placeholder?.label || parsed.key}
                            </Label>
                            <Badge variant="secondary" className="text-xs">
                              表格
                            </Badge>
                          </div>
                          
                          {/* 弹出框按钮 */}
                          <Popover
                            open={openFilterPopover === paramKey}
                            onOpenChange={(open) => setOpenFilterPopover(open ? paramKey : null)}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full justify-start text-left font-normal h-8 text-sm"
                                disabled={isLoadingTable || availableColumns.length === 0}
                              >
                                <span className={cn(
                                  "truncate flex-1",
                                  !currentConditionKey && "text-muted-foreground"
                                )}>
                                  {isLoadingTable ? "加载中..." : availableColumns.length === 0 ? "无可用列" : displayText}
                                </span>
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-4" align="start">
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">筛选条件</Label>
                                  <p className="text-xs text-muted-foreground">
                                    选择条件字段和对应的值
                                  </p>
                                </div>
                                
                                {/* 条件字段选择下拉框 */}
                                <div className="space-y-2">
                                  <Label htmlFor={`popover-condition-${paramKey}`} className="text-xs">
                                    条件字段
                                  </Label>
                                  <Select
                                    value={currentConditionKey}
                                    onValueChange={(selectedKey) => {
                                      // 更新条件字段：只保留新选择的字段
                                      const newParams: Record<string, string> = {};
                                      // 如果新字段已有值则保留，否则设为空字符串
                                      if (currentParams && typeof currentParams === "object" && currentParams[selectedKey]) {
                                        newParams[selectedKey] = currentParams[selectedKey];
                                      } else {
                                        newParams[selectedKey] = "";
                                      }
                                      setDebugPlaceholderParams({
                                        ...debugPlaceholderParams,
                                        [paramKey]: newParams,
                                      });
                                    }}
                                    disabled={isLoadingTable || availableColumns.length === 0}
                                  >
                                    <SelectTrigger id={`popover-condition-${paramKey}`} className="w-full h-8 text-sm">
                                      <SelectValue placeholder={isLoadingTable ? "加载中..." : availableColumns.length === 0 ? "无可用列" : "选择列"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableColumns.map((col) => (
                                        <SelectItem key={col.key} value={col.key}>
                                          {col.label || col.key}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                {/* 条件值输入框 */}
                                {currentConditionKey && (
                                  <div className="space-y-2">
                                    <Label htmlFor={`popover-value-${paramKey}`} className="text-xs">
                                      条件值
                                    </Label>
                                    <Input
                                      id={`popover-value-${paramKey}`}
                                      type={currentConditionKey === "row_id" ? "number" : "text"}
                                      value={currentValue}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        // 更新嵌套对象格式：{key: {condition_field: value}}
                                        setDebugPlaceholderParams({
                                          ...debugPlaceholderParams,
                                          [paramKey]: {
                                            ...(debugPlaceholderParams[paramKey] && typeof debugPlaceholderParams[paramKey] === "object" 
                                              ? debugPlaceholderParams[paramKey] 
                                              : {}),
                                            [currentConditionKey]: value,
                                          },
                                        });
                                      }}
                                      placeholder={`输入 ${availableColumns.find(col => col.key === currentConditionKey)?.label || currentConditionKey} 的值`}
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                )}
                                
                                {/* 清除按钮 */}
                                {currentConditionKey && (
                                  <div className="flex justify-end">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setDebugPlaceholderParams({
                                          ...debugPlaceholderParams,
                                          [paramKey]: {},
                                        });
                                        setOpenFilterPopover(null);
                                      }}
                                      className="h-7 text-xs"
                                    >
                                      清除
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                          
                          {placeholder?.description && (
                            <p className="text-xs text-muted-foreground">
                              {placeholder.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {parsedPlaceholders.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    该提示词没有占位符
                  </p>
                )}
                {parsedPlaceholders.length > 0 && inputPlaceholders.length === 0 && tablePlaceholders.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    未检测到需要输入的占位符
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
