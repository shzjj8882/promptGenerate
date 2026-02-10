"use client";

import { TableRow, TableCell } from "@/components/ui/table";

interface TableStateProps {
  loading: boolean;
  empty: boolean;
  colSpan: number;
  loadingText?: string;
  emptyText?: string;
}

/**
 * 表格状态组件
 * 统一管理表格的加载和空状态显示
 */
export function TableState({
  loading,
  empty,
  colSpan,
  loadingText = "加载中...",
  emptyText = "暂无数据",
}: TableStateProps) {
  if (loading) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="h-24 text-center text-sm text-muted-foreground">
          {loadingText}
        </TableCell>
      </TableRow>
    );
  }

  if (empty) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="h-24 text-center text-sm text-muted-foreground">
          {emptyText}
        </TableCell>
      </TableRow>
    );
  }

  return null;
}
