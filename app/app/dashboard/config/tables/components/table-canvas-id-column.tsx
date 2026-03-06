"use client";

/**
 * TableCanvas 左侧固定 ID 列（DOM，与 Canvas 表头对齐，用于可访问性与纵向滚动同步）
 */
import { CELL_HEIGHT, HEADER_HEIGHT, SCROLLBAR_SIZE } from "./table-canvas-constants";

export interface TableCanvasIdColumnProps {
  /** ID 列宽度 */
  idColumnWidth: number;
  /** 内容区总高度（行数 * 行高） */
  totalBodyHeight: number;
  /** 纵向滚动偏移 */
  scrollY: number;
  /** 当前展示的行（筛选后），用于渲染 row_id */
  rows: Array<{ row_id: number }>;
  /** 是否显示横向滚动条（用于 bottom 留白） */
  showHorizontalScrollbar?: boolean;
}

export function TableCanvasIdColumn({
  idColumnWidth,
  totalBodyHeight,
  scrollY,
  rows,
  showHorizontalScrollbar = false,
}: TableCanvasIdColumnProps) {
  return (
    <div
      className="absolute top-0 bottom-0 z-[32] flex flex-col bg-background pointer-events-none border-r border-border"
      style={{
        left: 0,
        width: idColumnWidth,
        bottom: showHorizontalScrollbar ? SCROLLBAR_SIZE : 0,
        right: "auto",
      }}
      aria-label="表格行标识列"
    >
      <div
        className="shrink-0 flex items-center px-2 border-b border-border bg-background text-muted-foreground text-sm font-medium"
        style={{ height: HEADER_HEIGHT }}
      >
        ID
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <div
          className="w-full"
          style={{
            height: totalBodyHeight,
            transform: `translateY(-${scrollY}px)`,
          }}
        >
          {rows.map((row) => (
            <div
              key={row.row_id}
              className="flex items-center px-2 border-b border-border text-sm text-foreground"
              style={{ height: CELL_HEIGHT }}
            >
              {row.row_id}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
