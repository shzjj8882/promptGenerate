"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface FormDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Footer 区域，不传则无 footer */
  footer?: React.ReactNode;
  /** 或使用简化的 submit/cancel 配置 */
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit?: () => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  error?: string;
  contentClassName?: string;
}

/**
 * 通用表单对话框壳
 * 封装 Dialog + DialogHeader + 可选 footer（默认取消/提交按钮）
 */
export function FormDialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  submitLabel,
  cancelLabel = "取消",
  onSubmit,
  onCancel,
  isSubmitting = false,
  error,
  contentClassName,
}: FormDialogShellProps) {
  const handleCancel = onCancel ?? (() => onOpenChange(false));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description != null && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        {children}

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {footer != null ? (
          footer
        ) : submitLabel != null && onSubmit != null ? (
          <DialogFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleCancel}>
              {cancelLabel}
            </Button>
            <Button onClick={onSubmit} disabled={isSubmitting}>
              {isSubmitting ? "保存中..." : submitLabel}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
