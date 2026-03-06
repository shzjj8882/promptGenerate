"use client";

import { Pencil, Trash2 } from "@/components/icons";
import type { TableRow as TableRowType } from "@/lib/api/multi-dimension-tables";

export interface TableCanvasRowContextMenuProps {
  row: TableRowType;
  x: number;
  y: number;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onEdit?: (row: TableRowType) => void;
  onDelete?: (row: TableRowType) => void;
  onClose: () => void;
}

export function TableCanvasRowContextMenu({
  row,
  x,
  y,
  menuRef,
  onEdit,
  onDelete,
  onClose,
}: TableCanvasRowContextMenuProps) {
  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[8rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: x, top: y }}
      role="menu"
    >
      <button
        type="button"
        className="flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0"
        onClick={() => {
          onEdit?.(row);
          onClose();
        }}
      >
        <Pencil className="size-3.5" />
        编辑
      </button>
      <button
        type="button"
        className="flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-destructive/10 text-destructive hover:text-destructive [&_svg]:size-4 [&_svg]:shrink-0"
        onClick={() => {
          onDelete?.(row);
          onClose();
        }}
      >
        <Trash2 className="size-3.5" />
        删除
      </button>
    </div>
  );
}
