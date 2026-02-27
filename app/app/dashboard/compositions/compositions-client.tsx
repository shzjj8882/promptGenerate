"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  MessageSquareText,
  Globe,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  MoreHorizontal,
  FileText,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PromptDebugDialog } from "../prompts/components/prompt-debug-dialog";
import { fromNotificationConfig, type NotificationOption } from "./components/notification-option-picker";
import { CompositionFormDialog } from "./components/composition-form-dialog";
import { CompositionWizardDialog } from "./components/composition-wizard-dialog";
import { useCompositions } from "./hooks/use-compositions";
import { useTenants } from "../prompts/hooks/use-tenants";
import { usePlaceholders } from "../prompts/hooks/use-placeholders";
import { getSceneLabel } from "../prompts/utils/prompt-utils";
import { getPromptBySceneTenant, getPrompt } from "@/lib/api/prompts";
import type { Prompt, Tenant } from "../prompts/prompts-client";
import type { Composition } from "@/lib/api/compositions";
import { getLLMModels, type LLMModel } from "@/lib/api/llm-models";
import { showSuccessToast, showErrorToast } from "@/lib/utils/toast";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/shared/page-header";

/** 从 notification_config 解析为展示文案（兼容 content_type / email_content_type） */
function getNotificationLabel(comp: Composition): string {
  if (comp.mode !== "api" || comp.task_mode !== "async") return "";
  const cfg = comp.notification_config;
  if (!cfg?.type || cfg.type !== "email") return "无";
  const ct = cfg.email_content_type ?? (cfg as { content_type?: string }).content_type;
  if (ct === "file") return "邮件(文件)";
  if (ct === "plain") return "邮件(纯文本)";
  return "邮件(HTML)";
}

/** 从 notification_config 解析为 NotificationOption（与 fromNotificationConfig 保持一致） */
function getNotificationOption(comp: Composition): NotificationOption | null {
  if (comp.mode !== "api" || comp.task_mode !== "async") return null;
  return fromNotificationConfig(comp.notification_config);
}

function CompositionsClientImpl() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const {
    compositions,
    loading,
    fetchCompositions,
    create,
    update,
    remove,
    currentPage,
    setCurrentPage,
    totalCount,
    totalPages,
    searchKeyword,
    setSearchKeyword,
  } = useCompositions();
  const { tenants, fetchTenants } = useTenants();
  const { placeholders, fetchPlaceholdersByScene } = usePlaceholders();
  const [models, setModels] = useState<LLMModel[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<Composition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Composition | null>(null);
  const [debuggingPrompt, setDebuggingPrompt] = useState<Prompt | null>(null);
  const [debuggingComposition, setDebuggingComposition] = useState<Composition | null>(null);
  const [isDebugDialogOpen, setIsDebugDialogOpen] = useState(false);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  useEffect(() => {
    fetchCompositions(currentPage, searchKeyword);
  }, [currentPage, searchKeyword, fetchCompositions]);

  // 搜索关键词变化时重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyword, setCurrentPage]);

  useEffect(() => {
    getLLMModels({ limit: 500 }).then((r) => setModels(r?.items ?? []));
  }, []);

  const modelMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const x of models) m[x.id] = x.name ?? x.model ?? x.id;
    return m;
  }, [models]);

  const displayCompositions = useMemo(
    () => compositions.filter((c) => c.is_active),
    [compositions]
  );

  const handleOpenPreview = useCallback(
    async (comp: Composition) => {
      try {
        const prompt = comp.prompt_id
          ? await getPrompt(comp.prompt_id)
          : await getPromptBySceneTenant({
              scene: comp.scene,
              tenant_id: comp.tenant_id || "default",
            });
        if (!prompt) {
          showErrorToast(`场景「${getSceneLabel(comp.scene)}」暂无默认提示词，请先在提示词管理中配置`);
          return;
        }
        await fetchPlaceholdersByScene(comp.scene);
        const mappedPrompt: Prompt = {
          id: prompt.id,
          scene: prompt.scene,
          tenantId: prompt.tenant_id === "default" ? "default" : prompt.tenant_id,
          content: prompt.content,
          placeholders: prompt.placeholders || [],
          isDefault: prompt.is_default,
          createdAt: prompt.created_at,
          updatedAt: prompt.updated_at,
        };
        setDebuggingPrompt(mappedPrompt);
        setDebuggingComposition(comp);
        setIsDebugDialogOpen(true);
      } catch {
        showErrorToast("获取提示词失败，请稍后重试");
      }
    },
    [fetchPlaceholdersByScene]
  );

  const handleSave = useCallback(
    async (data: Record<string, unknown>) => {
      if (editing) {
        await update(editing.id, data as Parameters<typeof update>[1]);
        showSuccessToast("更新成功");
      } else {
        await create(data as Parameters<typeof create>[0]);
        showSuccessToast("创建成功");
      }
      setFormOpen(false);
      setWizardOpen(false);
      setEditing(null);
    },
    [editing, create, update]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await remove(deleteTarget.id);
    showSuccessToast("删除成功");
    setDeleteTarget(null);
  }, [deleteTarget, remove]);

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title="组合"
        description="创建 LLM 消息模式或接口模式的组合，按步骤配置提示词、MCP 及通知方式"
        action={
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            {!loading && (compositions.length > 0 || searchKeyword) && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="按名称搜索"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="pl-9 w-full sm:w-48"
                />
              </div>
            )}
            {isMounted && (
              <Button onClick={() => { setEditing(null); setWizardOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                新建组合
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-1 min-h-0 flex-col gap-4">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : displayCompositions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{searchKeyword.trim() ? "无匹配的组合，请尝试其他关键词" : "暂无组合配置，点击「新建组合」添加"}</p>
        </div>
      ) : (
        <>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="grid gap-4 grid-cols-1 w-full">
          {displayCompositions.map((comp) => (
              <div
                key={comp.id}
                role="button"
                tabIndex={0}
                onDoubleClick={() => handleOpenPreview(comp)}
                className="group flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-border/80 cursor-pointer"
              >
                <div className="flex items-stretch justify-between gap-3">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="flex w-16 h-16 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      {comp.mode === "chat" ? (
                        <MessageSquareText className="h-10 w-10 text-primary" />
                      ) : (
                        <Globe className="h-10 w-10 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground truncate">{comp.name}</h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {getSceneLabel(comp.scene)}
                        {comp.mcp_id && " · MCP"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-xs">
                          大模型: {comp.model_id ? (modelMap[comp.model_id] ?? comp.model_id) : "未配置"}
                        </Badge>
                        {(comp.mode === "api" && comp.task_mode === "async") && (
                          <Badge variant="outline" className="text-xs">
                            通知: {getNotificationLabel(comp)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {isMounted && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">更多操作</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[140px]">
                        <DropdownMenuItem onClick={() => handleOpenPreview(comp)}>
                          <FileText className="mr-2 h-4 w-4" />
                          文档
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setEditing(comp); setFormOpen(true); setWizardOpen(false); }}>
                          <Pencil className="mr-2 h-4 w-4" />
                          编辑
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(comp)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
        </div>
        </div>
        {!loading && totalCount > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            onPageChange={setCurrentPage}
            disabled={loading}
          />
        )}
        </>
      )}
      </div>

      <CompositionWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSave={handleSave}
      />

      <CompositionFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        editing={editing}
        onSave={handleSave}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除组合「{deleteTarget?.name}」吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isMounted && (
        <PromptDebugDialog
          open={isDebugDialogOpen}
          onOpenChange={setIsDebugDialogOpen}
          prompt={debuggingPrompt}
          tenants={tenants}
          placeholders={placeholders}
          isMounted={isMounted}
          initialModelId={debuggingComposition?.model_id}
          initialMcpId={debuggingComposition?.mcp_id}
          initialMcpToolNames={debuggingComposition?.mcp_tool_names}
          initialNotificationOption={debuggingComposition ? getNotificationOption(debuggingComposition) : null}
          initialDebugMode={debuggingComposition?.mode === "api" ? "api" : "chat"}
          previewMode
          compositionId={debuggingComposition?.id}
          compositionName={debuggingComposition?.name}
          compositionTenantId={debuggingComposition?.tenant_id}
          compositionPromptId={debuggingComposition?.prompt_id ?? debuggingPrompt?.id}
        />
      )}
    </div>
  );
}

export const CompositionsClient = observer(CompositionsClientImpl);
