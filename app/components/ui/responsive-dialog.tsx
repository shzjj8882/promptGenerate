"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const MOBILE_BREAKPOINT = "(max-width: 639px)";

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 弹窗标题 */
  title: React.ReactNode;
  /** 弹窗描述，可选 */
  description?: React.ReactNode;
  /** 主内容区域 */
  children: React.ReactNode;
  /** 底部操作区，如按钮 */
  footer?: React.ReactNode;
  /** Dialog 额外 className */
  dialogClassName?: string;
  /** Sheet 额外 className */
  sheetClassName?: string;
}

/**
 * 响应式弹窗：PC 端居中 Dialog，移动端底部 Sheet
 * 同一内容，自适应展示
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  dialogClassName,
  sheetClassName,
}: ResponsiveDialogProps) {
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            "flex max-h-[90dvh] flex-col gap-4 overflow-hidden rounded-t-xl p-4 sm:p-6",
            sheetClassName
          )}
        >
          <SheetHeader className="flex-shrink-0 space-y-1.5 text-left">
            <SheetTitle className="text-xl">{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && (
            <SheetFooter className="flex-shrink-0 border-t pt-4">{footer}</SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[90dvh] flex-col gap-4 overflow-hidden rounded-lg border bg-background p-6 shadow-lg sm:max-w-[425px]",
          dialogClassName
        )}
      >
        <DialogHeader className="flex-shrink-0 space-y-1.5 text-left">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <DialogFooter className="flex-shrink-0 border-t pt-4 sm:border-0 sm:pt-0">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
