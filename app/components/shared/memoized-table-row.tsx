"use client";

import { memo } from "react";
import { Row } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { TableRow, TableCell } from "@/components/ui/table";

interface MemoizedTableRowProps<TData> {
  row: Row<TData>;
}

/**
 * Memoized 表格行组件
 * 优化表格渲染性能，避免不必要的重新渲染
 */
function MemoizedTableRowComponent<TData>({ row }: MemoizedTableRowProps<TData>) {
  const visibleCells = row.getVisibleCells().filter((cell) => cell.column.id !== "search");

  return (
    <TableRow>
      {visibleCells.map((cell) => (
        <TableCell
          key={cell.id}
          className={[
            "px-4 py-3 align-middle",
            cell.column.id === "actions" ? "text-right" : "",
          ].join(" ")}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );
}

/**
 * 自定义比较函数
 * 比较 row.id 来判断是否需要重新渲染
 */
function areEqual<TData>(
  prevProps: MemoizedTableRowProps<TData>,
  nextProps: MemoizedTableRowProps<TData>
) {
  // 如果 row.id 相同，则认为不需要重新渲染
  // 注意：这假设 row.id 是稳定的，如果 row 的数据发生变化但 id 相同，可能需要更深入的比较
  return prevProps.row.id === nextProps.row.id;
}

export const MemoizedTableRow = memo(MemoizedTableRowComponent, areEqual) as <TData>(
  props: MemoizedTableRowProps<TData>
) => React.ReactElement;
