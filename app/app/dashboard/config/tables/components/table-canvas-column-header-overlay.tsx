"use client";

/**
 * TableCanvas 表头列：hover 时下拉箭头按钮 + 点击后列菜单（编辑/插入/复制/删除）
 */
import { Button } from "@/components/ui/button";
import { ChevronDownIcon } from "@/components/icons";
import { TableCanvasColumnHeaderMenu } from "./table-canvas-column-header-menu";
import { getColumnLeftInView } from "./table-canvas-utils";
import {
  HEADER_HEIGHT,
  HEADER_DROPDOWN_RIGHT_GAP,
  HEADER_DROPDOWN_BUTTON_WIDTH,
  DEFAULT_COLUMN_WIDTH,
} from "./table-canvas-constants";
import type { TableColumn as TableColumnType } from "@/lib/api/multi-dimension-tables";

export interface TableCanvasColumnHeaderOverlayProps {
  /** 当前 hover 的列 key（显示下拉箭头） */
  hoveredColumnKey: string | null;
  /** 当前打开的列菜单 key */
  columnMenuOpen: string | null;
  setColumnMenuOpen: (key: string | null) => void;
  setHoveredColumnKey: (key: string | null) => void;
  /** 下拉箭头区域 onMouseEnter 时清除关闭定时器 */
  hoveredColumnClearTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  columns: TableColumnType[];
  columnWidths: Record<string, number>;
  idColumnWidth: number;
  scrollX: number;
  onEditColumn: (columnKey: string) => void;
  onInsertColumnLeft?: (columnKey: string) => void;
  onInsertColumnRight?: (columnKey: string) => void;
  onCopyColumn?: (columnKey: string) => void;
  onRequestDelete: (column: { key: string; label: string }) => void;
  /** 固定在左侧的列 keys（用于判断当前列是否已固定） */
  pinnedColumnKeys?: string[];
  /** 固定列按表序（与固定列 DOM 一致），用于精确计算下拉位置避免错位 */
  pinnedColsOrdered?: TableColumnType[];
  /** 切换固定在左侧 */
  onTogglePin?: (columnKey: string, pinned: boolean) => void;
}

export function TableCanvasColumnHeaderOverlay({
  hoveredColumnKey,
  columnMenuOpen,
  setColumnMenuOpen,
  setHoveredColumnKey,
  hoveredColumnClearTimeoutRef,
  columns,
  columnWidths,
  idColumnWidth,
  scrollX,
  onEditColumn,
  onInsertColumnLeft,
  onInsertColumnRight,
  onCopyColumn,
  onRequestDelete,
  pinnedColumnKeys,
  pinnedColsOrdered,
  onTogglePin,
}: TableCanvasColumnHeaderOverlayProps) {
  if (!hoveredColumnKey && !columnMenuOpen) return null;

  const dropdownKey = hoveredColumnKey && hoveredColumnKey !== columnMenuOpen ? hoveredColumnKey : null;
  const menuCol = columnMenuOpen ? columns.find((c) => c.key === columnMenuOpen) : null;

  /** 固定列下拉/菜单 left：与固定列 DOM 完全一致，按 pinnedColsOrdered 顺序累加宽度，避免错位 */
  const getPinnedColumnLeft = (columnKey: string): number => {
    if (!pinnedColsOrdered?.length || !pinnedColumnKeys?.includes(columnKey)) return -1;
    let left = idColumnWidth;
    for (const c of pinnedColsOrdered) {
      if (c.key === columnKey) return left;
      left += columnWidths[c.key] ?? DEFAULT_COLUMN_WIDTH;
    }
    return -1;
  };

  return (
    <>
      {dropdownKey && columns.some((c) => c.key === dropdownKey) && (() => {
        const pinnedLeft = getPinnedColumnLeft(dropdownKey);
        const colX =
          pinnedLeft >= 0
            ? pinnedLeft
            : getColumnLeftInView(dropdownKey, columns, columnWidths, idColumnWidth, scrollX, pinnedColumnKeys);
        const width = columnWidths[dropdownKey] ?? 0;
        const dropLeft =
          pinnedLeft >= 0
            ? colX + width - HEADER_DROPDOWN_BUTTON_WIDTH - HEADER_DROPDOWN_RIGHT_GAP
            : colX + scrollX + width - HEADER_DROPDOWN_BUTTON_WIDTH - HEADER_DROPDOWN_RIGHT_GAP;
        const isPinned = pinnedLeft >= 0;
        return (
          <div
            data-overlay
            className="absolute top-0 left-0 z-20 pointer-events-auto"
            style={{ height: HEADER_HEIGHT, marginLeft: isPinned ? 0 : -scrollX }}
          >
            <div
              className="flex items-center justify-center"
              style={{
                position: "absolute",
                top: 0,
                left: dropLeft,
                width: HEADER_DROPDOWN_BUTTON_WIDTH,
                height: HEADER_HEIGHT,
              }}
              onMouseEnter={() => {
                if (hoveredColumnClearTimeoutRef.current) {
                  clearTimeout(hoveredColumnClearTimeoutRef.current);
                  hoveredColumnClearTimeoutRef.current = null;
                }
              }}
              onMouseLeave={() => setHoveredColumnKey(null)}
            >
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 border border-border rounded hover:bg-muted shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setColumnMenuOpen(dropdownKey);
                }}
              >
                <ChevronDownIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })()}

      {menuCol && (() => {
        const menuPinnedLeft = getPinnedColumnLeft(columnMenuOpen!);
        const menuColX =
          menuPinnedLeft >= 0
            ? menuPinnedLeft
            : getColumnLeftInView(columnMenuOpen!, columns, columnWidths, idColumnWidth, scrollX, pinnedColumnKeys);
        const menuLeft =
          menuPinnedLeft >= 0
            ? menuColX + (columnWidths[menuCol.key] ?? 0) - HEADER_DROPDOWN_BUTTON_WIDTH - HEADER_DROPDOWN_RIGHT_GAP
            : menuColX + scrollX + (columnWidths[menuCol.key] ?? 0) - HEADER_DROPDOWN_BUTTON_WIDTH - HEADER_DROPDOWN_RIGHT_GAP;
        return (
        <div
          data-overlay
          className="absolute top-0 left-0 z-20 pointer-events-auto"
          style={{ height: HEADER_HEIGHT, marginLeft: menuPinnedLeft >= 0 ? 0 : -scrollX }}
        >
          <div
            className="absolute top-0 flex items-center justify-center"
            style={{
              left: menuLeft,
              width: HEADER_DROPDOWN_BUTTON_WIDTH,
              height: HEADER_HEIGHT,
            }}
          >
            <TableCanvasColumnHeaderMenu
              column={menuCol}
              onEditColumn={onEditColumn}
              onInsertColumnLeft={onInsertColumnLeft}
              onInsertColumnRight={onInsertColumnRight}
              onCopyColumn={onCopyColumn}
              onRequestDelete={onRequestDelete}
              onClose={() => setColumnMenuOpen(null)}
              isPinned={pinnedColumnKeys?.includes(menuCol.key)}
              onTogglePin={onTogglePin}
            />
          </div>
        </div>
        );
      })()}
    </>
  );
}
