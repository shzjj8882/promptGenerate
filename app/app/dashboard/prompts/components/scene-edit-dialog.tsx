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
import type { Scene } from "../prompts-client";
import type { Placeholder } from "@/lib/api/prompts";

interface SceneEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene: Scene | null;
  editSceneName: string;
  editSelectedPlaceholderKeys: Set<string>;
  isEditingScene: boolean;
  editSceneError: string | null;
  availablePlaceholders: Placeholder[];
  loadingPlaceholders: boolean;
  onNameChange: (name: string) => void;
  onTogglePlaceholder: (key: string) => void;
  onSave: () => void;
}

/**
 * 场景编辑对话框组件
 */
export const SceneEditDialog = memo(function SceneEditDialog({
  open,
  onOpenChange,
  scene,
  editSceneName,
  editSelectedPlaceholderKeys,
  isEditingScene,
  editSceneError,
  availablePlaceholders,
  loadingPlaceholders,
  onNameChange,
  onTogglePlaceholder,
  onSave,
}: SceneEditDialogProps) {
  return (
    <Dialog 
      open={open} 
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) {
          onTogglePlaceholder(""); // 重置占位符选择
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑场景</DialogTitle>
          <DialogDescription>
            修改场景名称，场景代码不允许修改。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-scene-code">场景代码</Label>
            <Input
              id="edit-scene-code"
              value={scene?.code || ""}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              场景代码创建后不允许修改
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-scene-name">场景名称</Label>
            <Input
              id="edit-scene-name"
              value={editSceneName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="请输入场景名称"
              disabled={isEditingScene}
            />
          </div>

          {/* 占位符选择 */}
          <div className="space-y-2">
            <Label>占位符配置（可选）</Label>
            <p className="text-xs text-muted-foreground mb-2">
              选择该场景可用的占位符，可在创建提示词时使用
            </p>
            <div className="max-h-[300px] overflow-y-auto space-y-2 border rounded-lg p-3 bg-muted/30 custom-scrollbar">
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
                  const isSelected = editSelectedPlaceholderKeys.has(placeholder.key);
                  return (
                    <label
                      key={placeholder.id || placeholder.key}
                      className="flex items-start gap-3 p-3 rounded-md border bg-background hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onTogglePlaceholder(placeholder.key)}
                        disabled={isEditingScene}
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

          {editSceneError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {editSceneError}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onTogglePlaceholder(""); // 重置占位符选择
            }}
            disabled={isEditingScene}
          >
            取消
          </Button>
          <Button 
            onClick={onSave} 
            disabled={isEditingScene || !editSceneName.trim()}
          >
            {isEditingScene ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
