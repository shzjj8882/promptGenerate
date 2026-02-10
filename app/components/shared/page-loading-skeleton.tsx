"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "./page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TableSkeleton } from "./table-skeleton";

interface PageTableLoadingSkeletonProps {
  title: string;
  description?: string;
  tableCols?: number;
  showSearchBar?: boolean;
  showActionButtons?: boolean;
}

/**
 * 表格页面加载骨架屏组件
 * 用于显示表格页面的加载状态（如租户管理、团队管理、权限管理等）
 */
export function PageTableLoadingSkeleton({
  title,
  description,
  tableCols = 4,
  showSearchBar = true,
  showActionButtons = true,
}: PageTableLoadingSkeletonProps) {
  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader title={title} description={description} />

      <div className="flex flex-1 min-h-0 flex-col gap-4">
        {/* 顶部工具栏骨架屏 */}
        {showSearchBar && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:max-w-sm">
              <Skeleton className="h-9 w-full" />
            </div>
            {showActionButtons && (
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-28" />
              </div>
            )}
          </div>
        )}

        {/* 表格骨架屏 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="overflow-hidden rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {Array.from({ length: tableCols }).map((_, index) => (
                    <TableHead key={index} className="h-12 px-4">
                      <Skeleton className="h-4 w-20" />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableSkeleton rows={5} cols={tableCols} />
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PageCardListLoadingSkeletonProps {
  title: string;
  description?: string;
  showFilters?: boolean;
  cardCount?: number;
}

/**
 * 卡片列表页面加载骨架屏组件
 * 用于显示卡片列表页面的加载状态（如提示词管理等）
 */
export function PageCardListLoadingSkeleton({
  title,
  description,
  showFilters = true,
  cardCount = 6,
}: PageCardListLoadingSkeletonProps) {
  return (
    <div className="space-y-6">
      {/* 页面头部骨架屏 */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          {description && <Skeleton className="h-4 w-96" />}
        </div>
      </div>

      {/* 筛选栏骨架屏 */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-48" />
        </div>
      )}

      {/* 卡片列表骨架屏 */}
      <div className="grid gap-4">
        {Array.from({ length: cardCount }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border-2 border-border bg-card p-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-3">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-32" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-16" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
