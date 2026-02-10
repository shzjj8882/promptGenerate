"use client";

import { memo, useRef } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getSceneLabel, formatPlaceholderText } from "../utils/prompt-utils";
import type { PromptScene, Prompt, Tenant, Placeholder } from "../prompts-client";

interface PromptFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPrompt: Prompt | null;
  editingScene: PromptScene | null;
  editingTenant: string | "default";
  formContent: string;
  validationError: string | null;
  usedPlaceholders: string[];
  placeholders: Placeholder[];
  loadingPlaceholders: boolean;
  tenants: Tenant[];
  onContentChange: (content: string) => void;
  onSave: () => void;
}

/**
 * 提示词创建/编辑对话框组件
 */
export const PromptFormDialog = memo(function PromptFormDialog({
  open,
  onOpenChange,
  editingPrompt,
  editingScene,
  editingTenant,
  formContent,
  validationError,
  usedPlaceholders,
  placeholders,
  loadingPlaceholders,
  tenants,
  onContentChange,
  onSave,
}: PromptFormDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 插入占位符（带光标位置处理）
  const handleInsertPlaceholder = (placeholder: Placeholder) => {
    // 使用新格式：根据占位符类型生成不同的格式
    const placeholderText = formatPlaceholderText(placeholder);

    // 如果有 textarea ref，在光标位置插入
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = formContent;
      const newText = text.slice(0, start) + placeholderText + text.slice(end);
      
      // 更新内容
      onContentChange(newText);
      
      // 设置光标位置到插入文本之后
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + placeholderText.length, start + placeholderText.length);
      }, 0);
    } else {
      // 否则追加到末尾
      onContentChange(`${formContent}${placeholderText}`);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) {
          // 关闭时清空验证错误
        }
      }}
    >
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col overflow-hidden p-6">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {editingPrompt ? "编辑提示词" : "创建提示词"}
          </DialogTitle>
          <DialogDescription>
            在内容中直接输入 {"{占位符}"}，删除大括号后会自动变为普通文本
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* 场景和租户信息（只读） */}
          <div className="flex-shrink-0 grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>场景</Label>
              <Input
                value={editingScene ? getSceneLabel(editingScene) : ""}
                disabled
              />
            </div>

            <div className="grid gap-2">
              <Label>租户</Label>
              <Input
                value={
                  editingTenant === "default"
                    ? "默认提示词"
                    : tenants.find((t) => t.id === editingTenant)?.name || editingTenant
                }
                disabled
              />
            </div>
          </div>

          {/* 左右布局 */}
          <div className="flex-1 flex gap-4 overflow-hidden">
            {/* 左侧：文本编辑（可滚动） */}
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
              <div className="flex-1 flex flex-col gap-2 overflow-hidden">
                <Label className="text-sm font-medium">提示词内容</Label>
                <div className="flex-1 overflow-y-auto rounded-lg border bg-muted/30 p-4 custom-scrollbar">
                  <Textarea
                    ref={textareaRef}
                    value={formContent}
                    onChange={(e) => {
                      onContentChange(e.target.value);
                    }}
                    placeholder="输入提示词内容，例如：亲爱的 {姓名}，您今年 {年龄} 岁，邮箱是 {邮箱}。"
                    className="min-h-full resize-none font-mono text-sm bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
                  />
                </div>
                {validationError && (
                  <p className="text-sm text-destructive mt-1">{validationError}</p>
                )}
              </div>

              {/* 当前使用的占位符 */}
              {usedPlaceholders.length > 0 && (
                <div className="flex-shrink-0 space-y-2 pt-2 border-t">
                  <Label className="text-sm font-medium">当前使用的占位符</Label>
                  <div className="flex flex-wrap gap-2">
                    {usedPlaceholders.map((ph) => {
                      const isKnown = placeholders.some((p) => p.label === ph);
                      return (
                        <Badge
                          key={ph}
                          variant={isKnown ? "secondary" : "outline"}
                          className={`transition-all hover:scale-105 ${
                            isKnown 
                              ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20" 
                              : "bg-muted text-muted-foreground border-muted-foreground/20 hover:bg-muted/80"
                          }`}
                        >
                          {"{"}
                          {ph}
                          {"}"}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 右侧：可用占位符列表（固定，不滚动） */}
            <div className="w-80 flex-shrink-0 flex flex-col gap-2 border-l pl-4">
              <Label className="text-sm font-medium">可用占位符</Label>
              {loadingPlaceholders ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  加载占位符中...
                </div>
              ) : (
                <TooltipProvider>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {placeholders.map((p) => {
                      const placeholderText = formatPlaceholderText(p);
                      const dataSourceType = (p as any).data_source_type || "user_input";
                      const isTableType = dataSourceType === "multi_dimension_table";
                      
                      return (
                        <div
                          key={p.key}
                          className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 transition-all hover:border-primary/50 hover:shadow-sm cursor-pointer group"
                          onClick={() => handleInsertPlaceholder(p)}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <button
                              type="button"
                              className="text-left text-sm font-medium group-hover:text-primary transition-colors flex-1 min-w-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInsertPlaceholder(p);
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <span className="truncate">{p.label}</span>
                                {isTableType && (
                                  <Badge variant="secondary" className="text-xs">
                                    表格
                                  </Badge>
                                )}
                              </div>
                            </button>
                            {p.description && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    }}
                                  >
                                    <HelpCircle className="h-4 w-4" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">{p.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <span className="font-mono text-xs text-muted-foreground ml-2 flex-shrink-0 group-hover:text-primary transition-colors">
                            {placeholderText}
                          </span>
                        </div>
                      );
                    })}
                    {placeholders.length === 0 && (
                      <div className="text-center py-8">
                        <p className="text-xs text-muted-foreground">
                          当前场景暂无可用占位符
                        </p>
                      </div>
                    )}
                  </div>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button onClick={onSave} disabled={!formContent}>
            {editingPrompt ? "更新" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
