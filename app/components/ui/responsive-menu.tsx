"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const MOBILE_BREAKPOINT = "(max-width: 639px)";

export interface ResponsiveMenuItem {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
}

interface ResponsiveMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  /** Sheet 标题（移动端显示） */
  title?: string;
  /** Dropdown 对齐方式（仅桌面端） */
  align?: "start" | "end" | "center";
  items: ResponsiveMenuItem[];
  /** 阻止事件冒泡（如列头、行操作在 overlay 上） */
  stopPropagation?: boolean;
}

/**
 * 响应式菜单：PC 端 DropdownMenu，移动端底部 Sheet
 * 移动端使用 Sheet 更适合触控操作
 */
export function ResponsiveMenu({
  open,
  onOpenChange,
  trigger,
  title = "操作",
  align = "end",
  items,
  stopPropagation = false,
}: ResponsiveMenuProps) {
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);

  const handleItemClick = (item: ResponsiveMenuItem) => {
    item.onClick();
    onOpenChange(false);
  };

  const wrapperProps = stopPropagation
    ? {
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        onMouseDown: (e: React.MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
        },
      }
    : {};

  if (isMobile) {
    const triggerWithClick = React.isValidElement(trigger)
      ? React.cloneElement(trigger as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>, {
          onClick: (e: React.MouseEvent) => {
            (trigger as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>).props?.onClick?.(e);
            if (stopPropagation) e.stopPropagation();
            onOpenChange(true);
          },
        })
      : trigger;

    return (
      <>
        <div {...wrapperProps} className="inline-flex">
          {triggerWithClick}
        </div>
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent
            side="bottom"
            className="flex max-h-[70dvh] flex-col gap-0 rounded-t-xl p-0"
          >
            <SheetHeader className="flex-shrink-0 border-b px-4 py-3 text-left">
              <SheetTitle className="text-base">{title}</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto">
              {items.map((item, index) => (
                <button
                  key={index}
                  type="button"
                  disabled={item.disabled}
                  className={cn(
                    "flex w-full items-center gap-2 px-4 py-3 text-left text-sm outline-none transition-colors hover:bg-accent active:bg-accent",
                    item.variant === "destructive" &&
                      "text-destructive hover:bg-destructive/10 focus:bg-destructive/10"
                  )}
                  onClick={() => handleItemClick(item)}
                >
                  {item.icon && (
                    <span className="[&_svg]:size-4 [&_svg]:shrink-0">
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <div {...wrapperProps} className="inline-flex">
        <DropdownMenuTrigger asChild>
          {trigger}
        </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {items.map((item, index) => (
          <DropdownMenuItem
            key={index}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            variant={item.variant}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
      </div>
    </DropdownMenu>
  );
}
