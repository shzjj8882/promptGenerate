"use client";

import { Send, Copy, Check } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldHelp } from "@/components/ui/field-help";
import { ApiFieldLabel } from "@/components/shared/api-field-label";
import { ObjectFieldSection } from "@/components/shared/object-field-section";
import { PlaceholderParamsPanel } from "./placeholders";
import { ModelLogo } from "@/components/shared/model-logo";
import { Checkbox } from "@/components/ui/checkbox";
import {
  NotificationOptionPicker,
  type NotificationOption,
  toEmailContentType,
} from "@/app/dashboard/compositions/components/notification-option-picker";
import { userStore } from "@/store/user-store";
import type { LLMModel } from "@/lib/api/llm-models";
import type { MCPConfig } from "@/lib/api/mcp";
import type { ParsedPlaceholderWithConfig } from "./placeholders";
import { cn } from "@/lib/utils";

export interface PromptDebugApiViewProps {
  apiUrl: string;
  prompt: { scene: string };
  streaming: boolean;
  previewMode: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onCopyCurl: () => void;
  copiedCurl: boolean;
  selectedModelId: string;
  onSelectedModelIdChange: (id: string) => void;
  requestTab: "params" | "body" | "headers";
  onRequestTabChange: (tab: "params" | "body" | "headers") => void;
  responseText: string;
  onResponseTextChange: (value: string) => void;
  compositionId?: string | null;
  compositionPromptId?: string | null;
  editableTenantId: string;
  onEditableTenantIdChange: (value: string) => void;
  tenants: Array<{ id: string; code_id: string; name: string }>;
  compositionTenantId?: string | null;
  needsTenant: boolean;
  debugTenantCode: string;
  onDebugTenantCodeChange: (value: string) => void;
  debugLLMConfig: { temperature?: number; max_tokens?: number };
  onDebugLLMConfigChange: (config: { temperature?: number; max_tokens?: number }) => void;
  models: LLMModel[];
  loadingModels: boolean;
  compositionConfigReadOnly: boolean;
  mcpConfigs: MCPConfig[];
  loadingMcps: boolean;
  selectedMcpId: string;
  onSelectedMcpIdChange: (id: string) => void;
  selectedMcpToolNames: Set<string>;
  onSelectedMcpToolNamesChange: (names: Set<string>) => void;
  inputPlaceholders: ParsedPlaceholderWithConfig[];
  tablePlaceholders: ParsedPlaceholderWithConfig[];
  debugPlaceholderParams: Record<string, unknown>;
  onDebugPlaceholderParamsChange: (params: Record<string, unknown>) => void;
  tableInfoMap: Record<string, import("@/lib/api/multi-dimension-tables").MultiDimensionTable>;
  loadingTables: Record<string, boolean>;
  openFilterPopover: string | null;
  onOpenFilterPopoverChange: (key: string | null) => void;
  notificationOption: NotificationOption;
  onNotificationOptionChange: (v: NotificationOption) => void;
  notificationEmailTo: string;
  onNotificationEmailToChange: (v: string) => void;
  effectiveHasEmailConfig: boolean;
  loadingNotificationConfigs: boolean;
}

/**
 * 提示词调试 - 接口模式（Postman 风格）视图
 */
export function PromptDebugApiView({
  apiUrl,
  prompt,
  streaming,
  previewMode,
  input,
  onInputChange,
  onSend,
  onCopyCurl,
  copiedCurl,
  selectedModelId,
  onSelectedModelIdChange,
  requestTab,
  onRequestTabChange,
  responseText,
  onResponseTextChange,
  compositionId,
  compositionPromptId,
  editableTenantId,
  onEditableTenantIdChange,
  tenants,
  compositionTenantId,
  needsTenant,
  debugTenantCode,
  onDebugTenantCodeChange,
  debugLLMConfig,
  onDebugLLMConfigChange,
  models,
  loadingModels,
  compositionConfigReadOnly,
  mcpConfigs,
  loadingMcps,
  selectedMcpId,
  onSelectedMcpIdChange,
  selectedMcpToolNames,
  onSelectedMcpToolNamesChange,
  inputPlaceholders,
  tablePlaceholders,
  debugPlaceholderParams,
  onDebugPlaceholderParamsChange,
  tableInfoMap,
  loadingTables,
  openFilterPopover,
  onOpenFilterPopoverChange,
  notificationOption,
  onNotificationOptionChange,
  notificationEmailTo,
  onNotificationEmailToChange,
  effectiveHasEmailConfig,
  loadingNotificationConfigs,
}: PromptDebugApiViewProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* 顶部：方法 + URL + 发送 */}
      <div className="border-b px-4 py-3 flex items-center gap-2 bg-muted/20">
        <Badge
          variant="secondary"
          className="font-mono text-xs shrink-0 bg-emerald-500/20 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-400 border-emerald-500/30"
        >
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
          onClick={onSend}
          disabled={!input.trim() || streaming || !selectedModelId}
          className="shrink-0 bg-primary hover:bg-primary/90"
          title={!selectedModelId ? "请先选择模型" : undefined}
        >
          <Send className="h-4 w-4 mr-1.5" />
          发送
        </Button>
        <Button variant="outline" size="sm" onClick={onCopyCurl} disabled={!prompt || streaming} className="shrink-0">
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
            onClick={() => onRequestTabChange(tab)}
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
      {/* Tab 内容 + 响应 */}
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
                          <Select value={editableTenantId || "default"} onValueChange={onEditableTenantIdChange} disabled={streaming}>
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
                              {compositionTenantId &&
                                compositionTenantId !== "default" &&
                                !tenants.some((t) => t.id === compositionTenantId) && (
                                  <SelectItem value={compositionTenantId}>{compositionTenantId}</SelectItem>
                                )}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                      <tr className="border-b last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">promptId</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground truncate">
                          {compositionPromptId}
                        </td>
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
                      <td
                        className="px-3 py-2 font-mono text-xs text-muted-foreground truncate"
                        title={userStore.user?.team_authcode ?? ""}
                      >
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
              <div className="border rounded-lg p-4 space-y-4 bg-card shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-primary rounded-full" />
                  <h3 className="font-semibold text-sm font-mono">请求参数</h3>
                  <FieldHelp content="必填与可选参数。" />
                </div>
                <div className="pl-4 border-l-2 border-muted-foreground/30 space-y-4">
                  <div className="space-y-1.5">
                    <ApiFieldLabel
                      keyName="user_message"
                      help="用户消息内容，必填。将作为提示词中的用户输入部分。"
                      typeBadge="string"
                      required
                      htmlFor="api-user-message"
                    />
                    <Textarea
                      id="api-user-message"
                      value={input}
                      onChange={(e) => onInputChange(e.target.value)}
                      placeholder="用户消息内容"
                      className="min-h-[72px] text-sm resize-none font-mono"
                      disabled={streaming}
                    />
                  </div>
                  {!compositionId && needsTenant && (
                    <div className="space-y-1.5">
                      <ApiFieldLabel
                        keyName="tenantCode"
                        help="租户编号，可选。用于多租户场景下的租户隔离。"
                        typeBadge="string"
                        optional
                        htmlFor="api-tenant"
                      />
                      <Input
                        id="api-tenant"
                        value={debugTenantCode}
                        onChange={(e) => onDebugTenantCodeChange(e.target.value)}
                        placeholder="租户编号"
                        className="h-9 text-sm font-mono"
                        disabled={streaming}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <ApiFieldLabel
                        keyName="model_id"
                        help="LLM 模型 ID，必填。将作为提示词调用的语言模型。"
                        typeBadge="string"
                        required
                        htmlFor="api-model"
                      />
                      <Select
                        value={selectedModelId}
                        onValueChange={onSelectedModelIdChange}
                        disabled={streaming || loadingModels || compositionConfigReadOnly}
                      >
                        <SelectTrigger id="api-model" className="h-9 text-sm w-full">
                          <SelectValue placeholder={loadingModels ? "加载中..." : "请选择模型"} />
                        </SelectTrigger>
                        <SelectContent>
                          {models.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              <ModelLogo provider={m.provider} model={m.model} name={m.name} size={20} showName />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <ApiFieldLabel
                        keyName="mcp_id"
                        help="MCP 配置 ID，可选。用于启用 MCP 工具调用。"
                        typeBadge="string"
                        optional
                        htmlFor="api-mcp"
                      />
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
                      <ApiFieldLabel
                        keyName="mcp_tool_names"
                        help="MCP 工具名称列表。可多选要启用的工具。"
                        typeBadge="string[]"
                      />
                      <div className="max-h-24 overflow-y-auto space-y-2 rounded border p-3 custom-scrollbar">
                        {mcpConfigs.find((c) => c.id === selectedMcpId)?.tools_cache?.map((tool) => (
                          <div key={tool.name} className="flex items-center space-x-2">
                            <Checkbox
                              id={`api-mcp-tool-${tool.name}`}
                              checked={selectedMcpToolNames.has(tool.name)}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedMcpToolNames);
                                if (checked) next.add(tool.name);
                                else next.delete(tool.name);
                                onSelectedMcpToolNamesChange(next);
                              }}
                              disabled={streaming || compositionConfigReadOnly}
                            />
                            <label htmlFor={`api-mcp-tool-${tool.name}`} className="text-sm cursor-pointer">
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
              <ObjectFieldSection
                title="llm_config"
                help="LLM 模型参数。temperature 控制随机性；max_tokens 限制最大输出长度。"
                grid
              >
                <div className="space-y-1.5">
                  <ApiFieldLabel keyName="temperature" typeBadge="number" nested htmlFor="api-llm-temp" />
                  <Input
                    id="api-llm-temp"
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={debugLLMConfig.temperature ?? 0.3}
                    onChange={(e) =>
                      onDebugLLMConfigChange({ ...debugLLMConfig, temperature: parseFloat(e.target.value) || 0.3 })
                    }
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
                    onChange={(e) =>
                      onDebugLLMConfigChange({
                        ...debugLLMConfig,
                        max_tokens: e.target.value ? parseInt(e.target.value) : undefined,
                      })
                    }
                    placeholder="留空不限制"
                    className="h-9 text-sm font-mono"
                    disabled={streaming}
                  />
                </div>
              </ObjectFieldSection>
              <ObjectFieldSection
                title="additional_params"
                help="占位符参数。根据提示词中的占位符动态生成，用于替换提示词中的变量。"
                grid
              >
                {inputPlaceholders.length > 0 || tablePlaceholders.length > 0 ? (
                  <PlaceholderParamsPanel
                    variant="api"
                    needsTenant={!compositionId && needsTenant}
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
                    disabled={streaming}
                    idPrefix="api-param"
                    asGridItems
                  />
                ) : (
                  <div className="sm:col-span-2">
                    <pre className="text-xs font-mono bg-muted/50 rounded p-3">
                      {JSON.stringify(debugPlaceholderParams, null, 2) || "{}"}
                    </pre>
                  </div>
                )}
              </ObjectFieldSection>
              <ObjectFieldSection
                title="notification"
                help="通知配置。异步任务完成后可选择邮件等方式通知。"
                grid
              >
                <div className="space-y-1.5">
                  <ApiFieldLabel keyName="type" typeBadge="string" nested badgeVariant="outline" />
                  <NotificationOptionPicker
                    value={notificationOption}
                    onChange={(v) => {
                      onNotificationOptionChange(v);
                      if (v === "none") onNotificationEmailToChange("");
                    }}
                    hasEmailConfig={effectiveHasEmailConfig}
                    disabled={streaming || loadingNotificationConfigs || compositionConfigReadOnly}
                  />
                </div>
                {notificationOption !== "none" && (
                  <>
                    <div className="space-y-1.5">
                      <ApiFieldLabel
                        keyName="email_to"
                        typeBadge="string"
                        nested
                        badgeVariant="outline"
                        htmlFor="api-notification-email"
                      />
                      <Input
                        id="api-notification-email"
                        type="email"
                        placeholder="收件人邮箱"
                        value={notificationEmailTo}
                        onChange={(e) => onNotificationEmailToChange(e.target.value)}
                        className="h-9 text-sm font-mono"
                        disabled={streaming}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <ApiFieldLabel keyName="email_content_type" typeBadge="string" nested badgeVariant="outline" />
                      <Select
                        value={toEmailContentType(notificationOption) ?? "html"}
                        onValueChange={(v) => onNotificationOptionChange(`email:${v}` as NotificationOption)}
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
        {/* 响应区 */}
        <div className="shrink-0 border-t p-4 bg-muted/5">
          <Label className="text-sm font-medium">响应</Label>
          <div className="mt-2 relative">
            {streaming && (
              <div className="absolute top-2 right-2 flex items-center gap-2 text-muted-foreground z-10">
                <div className="flex gap-1">
                  <div
                    className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
                <span className="text-xs">请求中...</span>
              </div>
            )}
            <Textarea
              value={responseText}
              onChange={(e) => onResponseTextChange(e.target.value)}
              placeholder="发送请求后在此显示响应，或粘贴 JSON 进行对比调试"
              className="min-h-[120px] max-h-[240px] text-xs font-mono resize-none bg-muted/30 border rounded-lg p-4 pr-24"
              readOnly={streaming}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
