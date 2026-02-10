"use client";

import { TableRow, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  rows?: number;
  cols: number;
  showHeader?: boolean;
}

/**
 * 表格骨架屏组件
 * 提供统一的表格加载骨架屏显示
 */
export function TableSkeleton({
  rows = 5,
  cols,
  showHeader = false,
}: TableSkeletonProps) {
  return (
    <>
      {showHeader && (
        <TableRow>
          {Array.from({ length: cols }).map((_, index) => (
            <TableCell key={index}>
              <Skeleton className="h-4 w-20" />
            </TableCell>
          ))}
        </TableRow>
      )}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: cols }).map((_, colIndex) => (
            <TableCell key={colIndex}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
