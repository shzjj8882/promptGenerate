"use client";

import { memo } from "react";
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
import type { Scene } from "../prompts-client";

interface SceneDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene: Scene | null;
  deletingScene: boolean;
  deleteSceneError: string | null;
  onConfirm: () => void;
}

/**
 * 场景删除确认对话框组件
 */
export const SceneDeleteDialog = memo(function SceneDeleteDialog({
  open,
  onOpenChange,
  scene,
  deletingScene,
  deleteSceneError,
  onConfirm,
}: SceneDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除场景</AlertDialogTitle>
          <AlertDialogDescription>
            您确定要删除场景 <strong>"{scene?.name}"</strong> 吗？
            <br />
            此操作不可恢复，删除后该场景下的所有提示词将无法通过场景筛选查看。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteSceneError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {deleteSceneError}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletingScene}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={deletingScene}
            className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60"
          >
            {deletingScene ? "删除中..." : "删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
