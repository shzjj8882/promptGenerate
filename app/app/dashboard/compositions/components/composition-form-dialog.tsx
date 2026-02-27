"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { getSceneLabel } from "@/app/dashboard/prompts/utils/prompt-utils";
import {
  NotificationOptionPicker,
  type NotificationOption,
  toEmailContentType,
  fromNotificationConfig,
} from "./notification-option-picker";
import { getPrompts, type Prompt as ApiPrompt } from "@/lib/api/prompts";
import { getLLMModels, type LLMModel } from "@/lib/api/llm-models";
import { getMCPConfigsForDebug, getMCPConfig, type MCPConfig, type MCPTool } from "@/lib/api/mcp";
import { getTenants, type Tenant as ApiTenant } from "@/lib/api/tenants";
import { getNotificationConfigsForDebug } from "@/lib/api/notification-config";
import type { Composition, CompositionCreate, CompositionUpdate } from "@/lib/api/compositions";
import { cn } from "@/lib/utils";

type TaskMode = "sync" | "async";

const SELECT_CLASS = "w-full min-w-0";

const STEPS = [
  { key: "basic", title: "基础信息" },
  { key: "llm", title: "LLM 配置" },
  { key: "message", title: "消息类型" },
];

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label>
      <span className="text-destructive">*</span> {children}
    </Label>
  );
}

interface CompositionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Composition | null;
  onSave: (data: CompositionCreate | CompositionUpdate) => Promise<void>;
}

export function CompositionFormDialog({
  open,
  onOpenChange,
  editing,
  onSave,
}: CompositionFormDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tenantId, setTenantId] = useState<string>("default");
  const [promptId, setPromptId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [mcpId, setMcpId] = useState<string>("__none__");
  const [mcpToolNames, setMcpToolNames] = useState<string[]>([]);
  const [taskMode, setTaskMode] = useState<TaskMode>("sync");
  const [notificationOption, setNotificationOption] = useState<NotificationOption>("none");
  const [sortOrder, setSortOrder] = useState(0);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mcpToolsOpen, setMcpToolsOpen] = useState(false);

  const [tenants, setTenants] = useState<Array<{ id: string; code_id: string; name: string }>>([]);
  const [prompts, setPrompts] = useState<ApiPrompt[]>([]);
  const [models, setModels] = useState<LLMModel[]>([]);
  const [mcps, setMcps] = useState<MCPConfig[]>([]);
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [notificationConfigs, setNotificationConfigs] = useState<Array<{ id: string; type: string; name: string }>>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      getTenants({ skip: 0, limit: 500, include_deleted: false }),
      getLLMModels({ limit: 200 }),
      getMCPConfigsForDebug(),
      getNotificationConfigsForDebug(),
    ])
      .then(([tRes, mRes, mc, nc]) => {
        setTenants(
          (tRes.items || [])
            .filter((x: ApiTenant) => !x.is_deleted)
            .map((x: ApiTenant) => ({ id: x.id, code_id: x.code_id, name: x.name }))
        );
        setModels(mRes?.items ?? []);
        setMcps(mc?.items ?? []);
        setNotificationConfigs(Array.isArray(nc) ? nc : []);
      })
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open || !tenantId) return;
    const isDefault = tenantId === "default";
    getPrompts({
      tenant_id: isDefault ? undefined : tenantId,
      is_default: isDefault ? true : undefined,
    }).then(setPrompts);
  }, [open, tenantId]);

  // 当编辑时无 prompt_id 但有 scene，从 prompts 中按 scene 匹配
  useEffect(() => {
    if (!open || !editing || !prompts.length) return;
    if (promptId) return;
    const match = prompts.find((p) => p.scene === editing.scene);
    if (match) setPromptId(match.id);
  }, [open, editing, prompts, promptId]);

  useEffect(() => {
    if (!open || !mcpId || mcpId === "__none__") {
      setMcpTools([]);
      return;
    }
    getMCPConfig(mcpId).then((m) => setMcpTools(m.tools_cache ?? []));
  }, [open, mcpId]);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useEffect(() => {
    if (open && editing) {
      setName(editing.name);
      setTenantId(editing.tenant_id || "default");
      setPromptId(editing.prompt_id || "");
      setModelId(editing.model_id || "");
      setMcpId(editing.mcp_id || "__none__");
      setMcpToolNames(editing.mcp_tool_names ?? []);
      setTaskMode((editing.task_mode as TaskMode) || "sync");
      setNotificationOption(fromNotificationConfig(editing.notification_config));
      setSortOrder(editing.sort_order ?? 0);
    } else if (open && !editing) {
      setName("");
      setDescription("");
      setTenantId("default");
      setPromptId("");
      setModelId("");
      setMcpId("__none__");
      setMcpToolNames([]);
      setTaskMode("sync");
      setNotificationOption("none");
      setSortOrder(0);
    }
    setError(null);
  }, [open, editing]);

  const currentStep = step;
  const maxStep = 2;
  const isLastStep = step === maxStep;

  const handleNext = () => {
    setError(null);
    if (currentStep === 0) {
      if (!name.trim()) {
        setError("请输入组合名称");
        return;
      }
    }
    if (currentStep === 1) {
      if (!promptId) {
        setError("请选择提示词");
        return;
      }
      if (!modelId) {
        setError("请选择模型");
        return;
      }
    }
    if (isLastStep) {
      handleSubmit();
      return;
    }
    setStep((s) => Math.min(s + 1, maxStep));
  };

  const handleBack = () => {
    setStep((s) => Math.max(0, s - 1));
    setError(null);
  };

  const toggleMcpTool = (toolName: string) => {
    setMcpToolNames((prev) =>
      prev.includes(toolName) ? prev.filter((t) => t !== toolName) : [...prev, toolName]
    );
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("请输入组合名称");
      return;
    }
    if (!editing) return;
    if (!modelId) {
      setError("请选择模型");
      return;
    }
    if (!promptId) {
      setError("请选择提示词");
      return;
    }
    setSaving(true);
    try {
      const prompt = prompts.find((p) => p.id === promptId);
      await onSave({
        name: name.trim(),
        scene: prompt?.scene ?? editing.scene,
        tenant_id: tenantId,
        prompt_id: promptId || undefined,
        model_id: modelId || undefined,
        mcp_id: mcpId === "__none__" ? null : mcpId,
        mcp_tool_names: mcpToolNames.length > 0 ? mcpToolNames : undefined,
        task_mode: taskMode,
        notification_config:
          taskMode === "async" && notificationOption !== "none"
            ? { type: "email", email_content_type: toEmailContentType(notificationOption) ?? "html" }
            : null,
        sort_order: sortOrder,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>编辑组合</DialogTitle>
          <DialogDescription>
            模式不可修改，可更新其他配置
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(e); }} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex gap-2 items-center mb-4 overflow-x-auto pb-2">
            {STEPS.map((s, i) => (
              <div
                key={s.key}
                className={cn(
                  "flex items-center gap-1 shrink-0 text-sm",
                  i <= currentStep ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <span className={cn("font-medium", i === currentStep && "text-primary")}>
                  {i + 1}. {s.title}
                </span>
                {i < maxStep && <ChevronRight className="h-4 w-4" />}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 min-h-0 py-2">
            {/* Step 1: 基础信息 */}
            {currentStep === 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-foreground">基础信息</h4>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>模式</Label>
                  <Input
                    value={editing.mode === "chat" ? "LLM 消息" : "接口"}
                    disabled
                    className={cn(SELECT_CLASS, "bg-muted")}
                  />
                </div>
                <div className="space-y-2">
                  <RequiredLabel>名称</RequiredLabel>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：客服场景组合"
                    className={SELECT_CLASS}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label>描述</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="简要描述该组合的用途"
                    className={cn(SELECT_CLASS, "min-h-[72px] resize-none")}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sort">排序</Label>
                  <Input
                    id="sort"
                    type="number"
                    min={0}
                    value={sortOrder}
                    onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
                    className={SELECT_CLASS}
                    disabled={loading}
                    placeholder="数字越小越靠前"
                  />
                </div>
              </div>
            </div>
            )}

            {/* Step 2: LLM 配置 */}
            {currentStep === 1 && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-foreground">LLM 配置</h4>
              <div className="space-y-3">
                <div className="space-y-2">
                  <RequiredLabel>租户</RequiredLabel>
                  <Select value={tenantId} onValueChange={setTenantId} disabled={loading}>
                    <SelectTrigger className={SELECT_CLASS}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">默认</SelectItem>
                      {tenants.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <RequiredLabel>提示词</RequiredLabel>
                  <Select value={promptId} onValueChange={setPromptId} disabled={loading}>
                    <SelectTrigger className={SELECT_CLASS}>
                      <SelectValue placeholder="选择提示词" />
                    </SelectTrigger>
                    <SelectContent>
                      {prompts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {getSceneLabel(p.scene)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <RequiredLabel>模型</RequiredLabel>
                  <Select value={modelId} onValueChange={setModelId} disabled={loading}>
                    <SelectTrigger className={SELECT_CLASS}>
                      <SelectValue placeholder="请选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>MCP 服务</Label>
                  <Select value={mcpId} onValueChange={setMcpId} disabled={loading}>
                    <SelectTrigger className={SELECT_CLASS}>
                      <SelectValue placeholder="不指定" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">不指定</SelectItem>
                      {mcps.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {mcpId && mcpId !== "__none__" && mcpTools.length > 0 && (
                  <div className="space-y-2">
                    <Label>MCP 工具</Label>
                    <Popover open={mcpToolsOpen} onOpenChange={setMcpToolsOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs",
                            "ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                            SELECT_CLASS
                          )}
                        >
                          <span className={mcpToolNames.length === 0 ? "text-muted-foreground" : ""}>
                            {mcpToolNames.length === 0
                              ? "请选择"
                              : mcpToolNames.length === 1
                                ? mcpTools.find((t) => t.name === mcpToolNames[0])?.title || mcpToolNames[0]
                                : `已选 ${mcpToolNames.length} 项`}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {mcpTools.map((t) => (
                            <div
                              key={t.name}
                              className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent cursor-pointer"
                              onClick={() => toggleMcpTool(t.name)}
                            >
                              <Checkbox
                                checked={mcpToolNames.includes(t.name)}
                                onCheckedChange={() => toggleMcpTool(t.name)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span className="text-sm">{t.title || t.name}</span>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>
            </div>
            )}

            {/* Step 3: 消息类型 */}
            {currentStep === 2 && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-foreground">消息类型</h4>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>消息类型</Label>
                  <Select
                    value={taskMode}
                    onValueChange={(v) => {
                      setTaskMode(v as TaskMode);
                      if (v === "sync") setNotificationOption("none");
                    }}
                    disabled={loading}
                  >
                    <SelectTrigger className={SELECT_CLASS}>
                      <SelectValue placeholder="选择消息类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sync">同步</SelectItem>
                      <SelectItem value="async">异步</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {taskMode === "async" && (
                  <div className="space-y-2">
                    <Label>通知方式</Label>
                    <NotificationOptionPicker
                      value={notificationOption}
                      onChange={setNotificationOption}
                      hasEmailConfig={notificationConfigs.length > 0}
                      disabled={loading}
                      className={SELECT_CLASS}
                    />
                    {notificationOption !== "none" && (
                      <p className="text-xs text-muted-foreground">收件人等在调用接口时填写</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="mt-4">
            {currentStep > 0 ? (
              <Button type="button" variant="outline" onClick={handleBack} disabled={saving}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                上一步
              </Button>
            ) : (
              <div />
            )}
            <Button type="button" onClick={handleNext} disabled={saving || loading}>
              {saving ? "保存中..." : isLastStep ? "保存" : "下一步"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
