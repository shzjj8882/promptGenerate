"use client";

/**
 * TableCanvas 列宽拖拽竖线、列拖拽排序的放置指示条与拖拽蒙层
 */
import { DEFAULT_COLUMN_WIDTH } from "./table-canvas-constants";
import { getColumnLeftInView } from "./table-canvas-utils";
import type { TableColumn as TableColumnType } from "@/lib/api/multi-dimension-tables";

export interface TableCanvasColumnDragOverlaysProps {
  /** 列宽拖拽时竖线在容器内的 x */
  resizeLineX: number | null;
  /** 列拖拽排序时放置目标列 key */
  dropTargetColumnKey: string | null;
  /** 正在拖拽的列 key */
  draggingColumnKey: string | null;
  /** 拖拽蒙层中心在容器内的 x（用于计算蒙层 left） */
  dragOverlayX: number | null;
  columns: TableColumnType[] | undefined;
  columnWidths: Record<string, number>;
  idColumnWidth: number;
  scrollX: number;
  /** 固定列 keys（用于 getColumnLeftInView 正确计算视口位置） */
  pinnedColumnKeys?: string[];
}

export function TableCanvasColumnDragOverlays({
  resizeLineX,
  dropTargetColumnKey,
  draggingColumnKey,
  dragOverlayX,
  columns,
  columnWidths,
  idColumnWidth,
  scrollX,
  pinnedColumnKeys,
}: TableCanvasColumnDragOverlaysProps) {
  return (
    <>
      {resizeLineX != null && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary pointer-events-none z-50"
          style={{ left: resizeLineX, transform: "translateX(-50%)" }}
          aria-hidden
        />
      )}

      {dropTargetColumnKey && columns?.length ? (
        <div key="drop-indicator" className="absolute inset-0 pointer-events-none z-50" aria-hidden>
          <div
            className="absolute top-0 bottom-0 w-2 bg-primary/20"
            style={{
              left:
                getColumnLeftInView(
                  dropTargetColumnKey,
                  columns,
                  columnWidths,
                  idColumnWidth,
                  scrollX,
                  pinnedColumnKeys
                ) - 4,
              width: 8,
            }}
          />
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary rounded-full"
            style={{
              left: getColumnLeftInView(
                dropTargetColumnKey,
                columns,
                columnWidths,
                idColumnWidth,
                scrollX,
                pinnedColumnKeys
              ),
              transform: "translateX(-50%)",
              boxShadow: "0 0 0 2px hsl(var(--primary) / 0.25)",
            }}
          />
        </div>
      ) : null}

      {draggingColumnKey && dragOverlayX != null && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-50 bg-gray-500/40 dark:bg-gray-500/35"
          style={{
            left: dragOverlayX - (columnWidths[draggingColumnKey] ?? DEFAULT_COLUMN_WIDTH) / 2,
            width: columnWidths[draggingColumnKey] ?? DEFAULT_COLUMN_WIDTH,
          }}
          aria-hidden
        />
      )}
    </>
  );
}
