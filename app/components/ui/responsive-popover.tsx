"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const MOBILE_BREAKPOINT = "(max-width: 639px)";

interface ResponsivePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  /** Sheet 标题（移动端显示） */
  title?: string;
  /** Popover 内容（桌面端） */
  content: React.ReactNode;
  /** Popover 对齐方式 */
  align?: "start" | "end" | "center";
  /** Popover 宽度样式（桌面端） */
  contentClassName?: string;
  contentStyle?: React.CSSProperties;
}

/**
 * 响应式 Popover：PC 端 Popover，移动端底部 Sheet
 * 适用于多选、选择器等下拉组件
 */
export function ResponsivePopover({
  open,
  onOpenChange,
  trigger,
  title = "请选择",
  content,
  align = "start",
  contentClassName,
  contentStyle,
}: ResponsivePopoverProps) {
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);

  if (isMobile) {
    const triggerWithClick = React.isValidElement(trigger)
      ? React.cloneElement(trigger as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>, {
          onClick: (e: React.MouseEvent) => {
            (trigger as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>).props?.onClick?.(e);
            onOpenChange(true);
          },
        })
      : trigger;

    return (
      <>
        {triggerWithClick}
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent
            side="bottom"
            className={cn(
              "flex max-h-[70dvh] flex-col gap-0 rounded-t-xl p-0",
              contentClassName
            )}
          >
            <SheetHeader className="flex-shrink-0 border-b px-4 py-3 text-left">
              <SheetTitle className="text-base">{title}</SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {content}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className={contentClassName} align={align} style={contentStyle}>
        {content}
      </PopoverContent>
    </Popover>
  );
}
