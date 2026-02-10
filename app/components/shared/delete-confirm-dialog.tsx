"use client";

import React from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string | React.ReactNode;
  itemName?: string;
  onConfirm: () => void;
  loading?: boolean;
  requireConfirmName?: boolean;
  confirmName?: string;
  onConfirmNameChange?: (value: string) => void;
  warningMessage?: string | React.ReactNode;
  error?: string;
}

/**
 * 删除确认对话框组件
 * 提供统一的删除确认对话框 UI
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  onConfirm,
  loading = false,
  requireConfirmName = false,
  confirmName = "",
  onConfirmNameChange,
  warningMessage,
  error,
}: DeleteConfirmDialogProps) {
  const canConfirm = requireConfirmName
    ? confirmName === itemName && !loading
    : !loading;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-base space-y-3">
              <div>{description}</div>
              {warningMessage && (
                <div className="rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3">
                  {typeof warningMessage === "string" ? (
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      {warningMessage}
                    </p>
                  ) : (
                    warningMessage
                  )}
                </div>
              )}
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              {requireConfirmName && itemName && (
                <div className="space-y-2">
                  <Label htmlFor="delete-confirm-name">
                    请输入{itemName.includes("租户") ? "租户名称" : "名称"}{" "}
                    <span className="font-semibold text-foreground">{itemName}</span>{" "}
                    以确认删除：
                  </Label>
                  <Input
                    id="delete-confirm-name"
                    value={confirmName}
                    onChange={(e) => onConfirmNameChange?.(e.target.value)}
                    placeholder="请输入名称"
                    className={error ? "border-destructive" : ""}
                  />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
              )}
              <div>
                <span className="text-muted-foreground">此操作不可恢复。</span>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={!canConfirm}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {loading ? "删除中..." : "确认删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
