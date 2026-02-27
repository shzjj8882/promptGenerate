"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Globe, ChevronRight, ChevronLeft, ChevronDown } from "lucide-react";
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
} from "./notification-option-picker";
import { getPrompts, type Prompt as ApiPrompt } from "@/lib/api/prompts";
import { getLLMModels, type LLMModel } from "@/lib/api/llm-models";
import { getMCPConfigsForDebug, getMCPConfig, type MCPConfig, type MCPTool } from "@/lib/api/mcp";
import { getTenants, type Tenant as ApiTenant } from "@/lib/api/tenants";
import { getNotificationConfigsForDebug } from "@/lib/api/notification-config";
import type { CompositionCreate } from "@/lib/api/compositions";
import { cn } from "@/lib/utils";

type Mode = "chat" | "api";
type TaskMode = "sync" | "async";

const SELECT_CLASS = "w-full min-w-0";

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label>
      <span className="text-destructive">*</span> {children}
    </Label>
  );
}

const STEPS = [
  { key: "basic", title: "基础信息" },
  { key: "llm", title: "LLM 配置" },
  { key: "message", title: "消息类型" },
];

interface CompositionWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: CompositionCreate) => Promise<void>;
}

export function CompositionWizardDialog({
  open,
  onOpenChange,
  onSave,
}: CompositionWizardDialogProps) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tenantId, setTenantId] = useState<string>("default");
  const [promptId, setPromptId] = useState<string>("");
  const [scene, setScene] = useState("");
  const [modelId, setModelId] = useState<string>("");
  const [mcpId, setMcpId] = useState<string>("__none__");
  const [mcpToolNames, setMcpToolNames] = useState<string[]>([]);
  const [taskMode, setTaskMode] = useState<TaskMode>("sync");
  const [notificationOption, setNotificationOption] = useState<NotificationOption>("none");
  const [sortOrder, setSortOrder] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tenants, setTenants] = useState<Array<{ id: string; code_id: string; name: string }>>([]);
  const [prompts, setPrompts] = useState<ApiPrompt[]>([]);
  const [models, setModels] = useState<LLMModel[]>([]);
  const [mcps, setMcps] = useState<MCPConfig[]>([]);
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [mcpToolsOpen, setMcpToolsOpen] = useState(false);
  const [notificationConfigs, setNotificationConfigs] = useState<Array<{ id: string; type: string; name: string }>>([]);

  useEffect(() => {
    if (open) {
      setStep(0);
      setMode(null);
      setTenantId("default");
      setPromptId("");
      setScene("");
      setModelId("");
      setMcpId("__none__");
      setMcpToolNames([]);
      setTaskMode("sync");
      setNotificationOption("none");
      setSortOrder(0);
      setName("");
      setDescription("");
      setError(null);
    }
  }, [open]);

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

  useEffect(() => {
    if (!open || !mcpId || mcpId === "__none__") {
      setMcpTools([]);
      return;
    }
    getMCPConfig(mcpId).then((m) => setMcpTools(m.tools_cache ?? []));
  }, [open, mcpId]);

  const promptSelected = prompts.find((p) => p.id === promptId);

  useEffect(() => {
    if (promptSelected?.scene) {
      setScene(promptSelected.scene);
    }
  }, [promptSelected?.scene]);

  const currentStep = step;
  const maxStep = 2;
  const isLastStep = step === maxStep;

  const handleNext = () => {
    setError(null);
    if (currentStep === 0) {
      if (!mode) {
        setError("请选择类型");
        return;
      }
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
      const p = prompts.find((x) => x.id === promptId);
      if (p) setScene(p.scene);
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

  const handleSubmit = async () => {
    if (!mode || !scene || !tenantId || !modelId) return;
    if (!name.trim()) {
      setError("请输入组合名称");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data: CompositionCreate = {
        name: name.trim(),
        mode,
        scene,
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
      };
      await onSave(data);
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleMcpTool = (toolName: string) => {
    setMcpToolNames((prev) =>
      prev.includes(toolName) ? prev.filter((t) => t !== toolName) : [...prev, toolName]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>新建组合</DialogTitle>
          <DialogDescription>
            按步骤创建组合，支持 LLM 消息模式与接口模式，创建后模式不可切换
          </DialogDescription>
        </DialogHeader>

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

        <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
          {/* Step 1: 类型、名称、描述 */}
          {currentStep === 0 && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">基础信息</h4>
            <div className="space-y-3">
              <div className="space-y-2">
                <RequiredLabel>类型</RequiredLabel>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMode("chat")}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors",
                      mode === "chat"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <MessageSquare className="h-8 w-8" />
                    <span className="text-sm font-medium">LLM 消息</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("api")}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors",
                      mode === "api"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <Globe className="h-8 w-8" />
                    <span className="text-sm font-medium">接口</span>
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <RequiredLabel>名称</RequiredLabel>
                <Input
                  id="comp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：客服场景组合"
                  className={SELECT_CLASS}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comp-desc">描述</Label>
                <Textarea
                  id="comp-desc"
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

        <DialogFooter>
          {currentStep > 0 ? (
            <Button type="button" variant="outline" onClick={handleBack} disabled={saving}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              上一步
            </Button>
          ) : (
            <div />
          )}
          <Button onClick={handleNext} disabled={saving || loading}>
            {saving ? "保存中..." : isLastStep ? "完成" : "下一步"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
