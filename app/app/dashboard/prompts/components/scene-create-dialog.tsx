"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Placeholder } from "@/lib/api/prompts";

interface SceneCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newSceneCode: string;
  newSceneName: string;
  selectedPlaceholderKeys: Set<string>;
  creatingScene: boolean;
  createSceneError: string | null;
  availablePlaceholders: Placeholder[];
  loadingPlaceholders: boolean;
  onCodeChange: (code: string) => void;
  onNameChange: (name: string) => void;
  onTogglePlaceholder: (key: string) => void;
  onCreate: () => void;
}

/**
 * 场景创建对话框组件
 */
export const SceneCreateDialog = memo(function SceneCreateDialog({
  open,
  onOpenChange,
  newSceneCode,
  newSceneName,
  selectedPlaceholderKeys,
  creatingScene,
  createSceneError,
  availablePlaceholders,
  loadingPlaceholders,
  onCodeChange,
  onNameChange,
  onTogglePlaceholder,
  onCreate,
}: SceneCreateDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        // 注意：重置逻辑由父组件在 onOpenChange 回调中处理
        // 这里不需要再次重置，避免重复调用
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>添加场景</DialogTitle>
          <DialogDescription>
            创建一个新的业务场景，场景代码只能包含字母、数字和下划线。您可以选择同时配置占位符。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4 custom-scrollbar">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="scene-code">
                场景代码 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="scene-code"
                value={newSceneCode}
                onChange={(e) => {
                  onCodeChange(e.target.value);
                }}
                placeholder="例如: custom_scene"
                className="font-mono"
                disabled={creatingScene}
              />
              <p className="text-xs text-muted-foreground">
                只能包含字母、数字和下划线
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="scene-name">
                场景名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="scene-name"
                value={newSceneName}
                onChange={(e) => {
                  onNameChange(e.target.value);
                }}
                placeholder="例如: 自定义场景"
                disabled={creatingScene}
              />
            </div>
          </div>

          {/* 占位符配置区域 */}
          <div className="space-y-3">
            <Label>占位符配置（可选）</Label>
            <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
              {loadingPlaceholders ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  加载占位符列表...
                </div>
              ) : !availablePlaceholders || availablePlaceholders.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  暂无可用占位符，请先在"占位符编辑设计"中创建占位符
                </div>
              ) : (
                // 去重：按 key 去重，避免重复显示
                Array.from(
                  new Map(availablePlaceholders.map(p => [p.key, p])).values()
                ).map((placeholder) => {
                  const isSelected = selectedPlaceholderKeys.has(placeholder.key);
                  return (
                    <label
                      key={placeholder.id || placeholder.key}
                      className="flex items-start gap-3 p-3 rounded-md border bg-background hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onTogglePlaceholder(placeholder.key)}
                        disabled={creatingScene}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{placeholder.label}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {placeholder.key}
                          </span>
                        </div>
                        {placeholder.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {placeholder.description}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {createSceneError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {createSceneError}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creatingScene}
          >
            取消
          </Button>
          <Button 
            onClick={onCreate} 
            disabled={creatingScene || !newSceneCode.trim() || !newSceneName.trim()}
          >
            {creatingScene ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
