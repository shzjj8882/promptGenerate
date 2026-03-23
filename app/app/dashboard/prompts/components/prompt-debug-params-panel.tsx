"use client";

import { Copy, Check, HelpCircle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PlaceholderParamsPanel } from "./placeholders";
import { ModelLogo } from "@/components/shared/model-logo";
import { Checkbox } from "@/components/ui/checkbox";
import type { LLMModel } from "@/lib/api/llm-models";
import type { MCPConfig } from "@/lib/api/mcp";
import type { ParsedPlaceholderWithConfig } from "./placeholders";

export interface PromptDebugParamsPanelProps {
  configReadOnly: boolean;
  debugMode: "chat" | "api";
  onDebugModeChange: (mode: "chat" | "api") => void;
  streaming: boolean;
  prompt: { scene: string } | null;
  onCopyCurl: () => void;
  copiedCurl: boolean;
  isMounted: boolean;
  previewMode: boolean;
  debugLLMConfig: { temperature?: number; max_tokens?: number };
  onDebugLLMConfigChange: (config: { temperature?: number; max_tokens?: number }) => void;
  debugParamsEditable: boolean;
  selectedModelId: string;
  onSelectedModelIdChange: (id: string) => void;
  models: LLMModel[];
  loadingModels: boolean;
  mcpConfigs: MCPConfig[];
  loadingMcps: boolean;
  selectedMcpId: string;
  onSelectedMcpIdChange: (id: string) => void;
  selectedMcpToolNames: Set<string>;
  onSelectedMcpToolNamesChange: (names: Set<string>) => void;
  needsTenant: boolean;
  debugTenantCode: string;
  onDebugTenantCodeChange: (value: string) => void;
  inputPlaceholders: ParsedPlaceholderWithConfig[];
  tablePlaceholders: ParsedPlaceholderWithConfig[];
  debugPlaceholderParams: Record<string, unknown>;
  onDebugPlaceholderParamsChange: (params: Record<string, unknown>) => void;
  tableInfoMap: Record<string, import("@/lib/api/multi-dimension-tables").MultiDimensionTable>;
  loadingTables: Record<string, boolean>;
  openFilterPopover: string | null;
  onOpenFilterPopoverChange: (key: string | null) => void;
}

/**
 * 提示词调试 - 右侧参数配置面板（仅聊天模式显示）
 */
export function PromptDebugParamsPanel({
  configReadOnly,
  debugMode,
  onDebugModeChange,
  streaming,
  prompt,
  onCopyCurl,
  copiedCurl,
  isMounted,
  previewMode,
  debugLLMConfig,
  onDebugLLMConfigChange,
  debugParamsEditable,
  selectedModelId,
  onSelectedModelIdChange,
  models,
  loadingModels,
  mcpConfigs,
  loadingMcps,
  selectedMcpId,
  onSelectedMcpIdChange,
  selectedMcpToolNames,
  onSelectedMcpToolNamesChange,
  needsTenant,
  debugTenantCode,
  onDebugTenantCodeChange,
  inputPlaceholders,
  tablePlaceholders,
  debugPlaceholderParams,
  onDebugPlaceholderParamsChange,
  tableInfoMap,
  loadingTables,
  openFilterPopover,
  onOpenFilterPopoverChange,
}: PromptDebugParamsPanelProps) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar">
      {/* 调试配置（预览模式下不展示） */}
      {!previewMode && (
        <div className="border rounded-lg p-4 space-y-4 bg-card shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-primary rounded-full" />
            <h3 className="font-semibold text-sm">调试配置</h3>
            {configReadOnly && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                配置只读，参数可调
              </Badge>
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
                    onCheckedChange={(checked) => onDebugModeChange(checked ? "chat" : "api")}
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
                  onClick={onCopyCurl}
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
          <Badge variant="secondary" className="text-xs">
            object
          </Badge>
        </div>
        <div className="pl-4 border-l-2 border-muted-foreground/30 space-y-3">
          <div className="space-y-2">
            <ApiFieldLabel
              keyName="model_id"
              help="LLM 模型 ID，必填。"
              typeBadge="string"
              nested
              badgeVariant="outline"
              required
              htmlFor="debug-model"
            />
            <Select
              value={selectedModelId}
              onValueChange={onSelectedModelIdChange}
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
                      <ModelLogo
                        provider={model.provider}
                        model={model.model}
                        name={`${model.name ?? model.model ?? model.id}${model.is_default ? " [默认]" : ""}`}
                        size={20}
                        showName
                      />
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <ApiFieldLabel
              keyName="temperature"
              help="控制输出随机性，0-2，越小越确定。"
              typeBadge="number"
              nested
              badgeVariant="outline"
              htmlFor="debug-temperature"
            />
            <Input
              id="debug-temperature"
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={debugLLMConfig.temperature ?? 0.3}
              onChange={(e) =>
                onDebugLLMConfigChange({
                  ...debugLLMConfig,
                  temperature: parseFloat(e.target.value) || 0.3,
                })
              }
              disabled={!debugParamsEditable}
            />
          </div>
          <div className="space-y-2">
            <ApiFieldLabel
              keyName="max_tokens"
              help="限制模型最大输出 token 数，可选。留空则不限制。"
              typeBadge="number"
              nested
              badgeVariant="outline"
              htmlFor="debug-max-tokens"
            />
            <Input
              id="debug-max-tokens"
              type="number"
              min="1"
              value={debugLLMConfig.max_tokens ?? ""}
              onChange={(e) =>
                onDebugLLMConfigChange({
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
                  onSelectedMcpIdChange(id);
                  const mcp = id && id !== "__none__" ? mcpConfigs.find((c) => c.id === id) : null;
                  if (mcp?.tools_cache?.length) {
                    onSelectedMcpToolNamesChange(new Set(mcp.tools_cache.map((t) => t.name)));
                  } else {
                    onSelectedMcpToolNamesChange(new Set());
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
                <Label>勾选可用的 MCP 工具</Label>
                <div className="max-h-32 overflow-y-auto space-y-2 rounded border p-2 custom-scrollbar">
                  {mcpConfigs
                    .find((c) => c.id === selectedMcpId)
                    ?.tools_cache?.map((tool) => (
                      <div key={tool.name} className="flex items-center space-x-2">
                        <Checkbox
                          id={`mcp-tool-${tool.name}`}
                          checked={selectedMcpToolNames.has(tool.name)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedMcpToolNames);
                            if (checked) next.add(tool.name);
                            else next.delete(tool.name);
                            onSelectedMcpToolNamesChange(next);
                          }}
                          disabled={configReadOnly}
                        />
                        <label htmlFor={`mcp-tool-${tool.name}`} className="text-sm cursor-pointer flex-1">
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
          <Badge variant="secondary" className="text-xs">
            object
          </Badge>
        </div>
        <div className="pl-4 border-l-2 border-muted-foreground/30 space-y-3">
          <PlaceholderParamsPanel
            variant="chat"
            needsTenant={needsTenant}
            tenantValue={debugTenantCode}
            onTenantChange={onDebugTenantCodeChange}
            inputPlaceholders={inputPlaceholders}
            tablePlaceholders={tablePlaceholders}
            params={debugPlaceholderParams}
            onParamsChange={onDebugPlaceholderParamsChange}
            tableInfoMap={tableInfoMap}
            loadingTables={loadingTables}
            openFilterPopover={openFilterPopover}
            onOpenFilterPopoverChange={onOpenFilterPopoverChange}
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
          onClick={onCopyCurl}
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
  );
}
