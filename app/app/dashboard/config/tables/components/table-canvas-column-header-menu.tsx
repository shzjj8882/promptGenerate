"use client";

import { Button } from "@/components/ui/button";
import { ResponsiveMenu } from "@/components/ui/responsive-menu";
import { Pencil, Trash2, ChevronDownIcon, ChevronRightIcon, ArrowLeft, Copy, FreezeColumn } from "@/components/icons";
import type { TableColumn as TableColumnType } from "@/lib/api/multi-dimension-tables";

export interface TableCanvasColumnHeaderMenuProps {
  column: TableColumnType;
  onEditColumn: (columnKey: string) => void;
  onInsertColumnLeft?: (columnKey: string) => void;
  onInsertColumnRight?: (columnKey: string) => void;
  onCopyColumn?: (columnKey: string) => void;
  onRequestDelete: (column: { key: string; label: string }) => void;
  onClose: () => void;
  /** 当前列是否已固定在左侧（用于显示「取消固定列」文案） */
  isPinned?: boolean;
  /** 切换固定在左侧状态 */
  onTogglePin?: (columnKey: string, pinned: boolean) => void;
}

export function TableCanvasColumnHeaderMenu({
  column,
  onEditColumn,
  onInsertColumnLeft,
  onInsertColumnRight,
  onCopyColumn,
  onRequestDelete,
  onClose,
  isPinned,
  onTogglePin,
}: TableCanvasColumnHeaderMenuProps) {
  const items = [
    { icon: <Pencil className="size-3.5" />, label: "修改列名称", onClick: () => onEditColumn(column.key) },
    ...(onTogglePin
      ? ([
          { type: "separator" as const },
          {
            icon: (
              <FreezeColumn theme="outline" size={14} strokeLinejoin="miter" className="[&_svg]:shrink-0" />
            ),
            label: isPinned ? "取消固定列" : "固定在左侧",
            onClick: () => {
              onTogglePin(column.key, !isPinned);
            },
          },
        ] as const)
      : []),
    { type: "separator" as const },
    {
      icon: <ArrowLeft className="size-3.5" />,
      label: "向左插入列",
      onClick: () => {
        onInsertColumnLeft?.(column.key);
        onClose();
      },
      disabled: !onInsertColumnLeft,
    },
    {
      icon: <ChevronRightIcon className="size-3.5" />,
      label: "向右插入列",
      onClick: () => {
        onInsertColumnRight?.(column.key);
        onClose();
      },
      disabled: !onInsertColumnRight,
    },
    {
      icon: <Copy className="size-3.5" />,
      label: "复制列",
      onClick: () => {
        onCopyColumn?.(column.key);
        onClose();
      },
      disabled: !onCopyColumn,
    },
    { type: "separator" as const },
    {
      icon: <Trash2 className="size-3.5" />,
      label: "删除列",
      onClick: () => {
        onRequestDelete({ key: column.key, label: column.label });
        onClose();
      },
      variant: "destructive" as const,
    },
  ];

  return (
    <ResponsiveMenu
      open={true}
      onOpenChange={(o) => !o && onClose()}
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 border border-border rounded hover:bg-muted shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <ChevronDownIcon className="h-4 w-4" />
        </Button>
      }
      title={`列: ${column.label}`}
      align="end"
      stopPropagation
      itemIconClassName="[&_svg]:size-3.5 [&_svg]:shrink-0"
      items={items}
    />
  );
}
