"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PaginationProps = {
  currentPage: number;
  totalPages: number;
  totalCount?: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  className?: string;
  /** 仅在有总条数时展示“共 N 条记录，第 x / y 页”；否则只展示页码区 */
  showSummary?: boolean;
};

const MAX_VISIBLE_PAGES = 5;

function getVisiblePageNumbers(currentPage: number, totalPages: number): number[] {
  // 确保输入参数有效
  const safeCurrentPage = Number.isFinite(currentPage) && currentPage > 0 ? Math.floor(currentPage) : 1;
  const safeTotalPages = Number.isFinite(totalPages) && totalPages > 0 ? Math.floor(totalPages) : 1;
  
  if (safeTotalPages <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: safeTotalPages }, (_, i) => i + 1);
  }
  if (safeCurrentPage <= 3) {
    return [1, 2, 3, 4, 5];
  }
  if (safeCurrentPage >= safeTotalPages - 2) {
    return Array.from({ length: MAX_VISIBLE_PAGES }, (_, i) => safeTotalPages - 4 + i);
  }
  return Array.from({ length: MAX_VISIBLE_PAGES }, (_, i) => safeCurrentPage - 2 + i);
}

export function Pagination({
  currentPage,
  totalPages,
  totalCount,
  onPageChange,
  disabled = false,
  className,
  showSummary = true,
}: PaginationProps) {
  // 确保输入参数有效
  const safeCurrentPage = Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1;
  const safeTotalPages = Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1;
  const pages = getVisiblePageNumbers(safeCurrentPage, safeTotalPages);

  // 确保显示的值是有效的
  const safeTotalCount = totalCount != null && Number.isFinite(totalCount) && totalCount >= 0 ? totalCount : 0;

  return (
    <div className={cn("flex items-center justify-between shrink-0", className)}>
      {showSummary && totalCount != null && (
        <div className="text-sm text-muted-foreground">
          共 {safeTotalCount} 条记录，第 {safeCurrentPage} / {safeTotalPages} 页
        </div>
      )}
      {showSummary && totalCount == null && <div />}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const newPage = Math.max(1, safeCurrentPage - 1);
            if (Number.isFinite(newPage) && newPage >= 1) {
              onPageChange(newPage);
            }
          }}
          disabled={safeCurrentPage === 1 || disabled}
        >
          <ChevronLeft className="h-4 w-4" />
          上一页
        </Button>
        <div className="flex items-center gap-1">
          {pages.map((pageNum) => (
            <Button
              key={pageNum}
              variant={safeCurrentPage === pageNum ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (Number.isFinite(pageNum) && pageNum >= 1) {
                  onPageChange(pageNum);
                }
              }}
              disabled={disabled}
              className="w-10"
            >
              {pageNum}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const newPage = Math.min(safeTotalPages, safeCurrentPage + 1);
            if (Number.isFinite(newPage) && newPage >= 1) {
              onPageChange(newPage);
            }
          }}
          disabled={safeCurrentPage === safeTotalPages || disabled}
        >
          下一页
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
