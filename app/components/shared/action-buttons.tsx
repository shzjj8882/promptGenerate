"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { ReactNode } from "react";

interface ActionButtonsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
  deleteLoading?: boolean;
  variant?: "dropdown" | "inline";
  size?: "sm" | "default";
  additionalActions?: Array<{
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    variant?: "default" | "destructive";
    disabled?: boolean;
  }>;
}

/**
 * 操作按钮组件
 * 提供统一的编辑/删除按钮组合，支持权限控制和多种显示模式
 */
export const ActionButtons = memo(function ActionButtons({
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
  deleteLoading = false,
  variant = "dropdown",
  size = "sm",
  additionalActions = [],
}: ActionButtonsProps) {
  const hasEdit = canEdit && onEdit;
  const hasDelete = canDelete && onDelete;
  const hasActions = hasEdit || hasDelete || additionalActions.length > 0;

  if (!hasActions) {
    return null;
  }

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-2">
        {hasEdit && (
          <Button
            variant="ghost"
            size={size}
            onClick={onEdit}
            className="h-8 px-3 hover:bg-primary/10"
          >
            <Pencil className="h-4 w-4 mr-1.5" />
            编辑
          </Button>
        )}
        {hasDelete && (
          <Button
            variant="ghost"
            size={size}
            onClick={onDelete}
            disabled={deleteLoading}
            className="h-8 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            删除
          </Button>
        )}
        {additionalActions.map((action, index) => (
          <Button
            key={index}
            variant="ghost"
            size={size}
            onClick={action.onClick}
            disabled={action.disabled}
            className={
              action.variant === "destructive"
                ? "h-8 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                : "h-8 px-3 hover:bg-primary/10"
            }
          >
            {action.icon && <span className="mr-1.5">{action.icon}</span>}
            {action.label}
          </Button>
        ))}
      </div>
    );
  }

  // Dropdown variant
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size={size} className="h-8 w-8 p-0">
            <span className="sr-only">打开菜单</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {additionalActions.map((action, index) => (
            <DropdownMenuItem
              key={index}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.icon && <span className="mr-2">{action.icon}</span>}
              {action.label}
            </DropdownMenuItem>
          ))}
          {additionalActions.length > 0 && (hasEdit || hasDelete) && (
            <DropdownMenuSeparator />
          )}
          {hasEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              编辑
            </DropdownMenuItem>
          )}
          {hasEdit && hasDelete && <DropdownMenuSeparator />}
          {hasDelete && (
            <DropdownMenuItem
              variant="destructive"
              onClick={onDelete}
              disabled={deleteLoading}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              删除
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
