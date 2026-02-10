"use client";

import { useState, useCallback, useMemo } from "react";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

interface UsePaginationOptions {
  initialPage?: number;
  pageSize?: number;
  initialTotal?: number;
}

interface UsePaginationReturn {
  currentPage: number;
  setCurrentPage: (page: number) => void;
  pageSize: number;
  totalCount: number;
  setTotalCount: (total: number) => void;
  totalPages: number;
  skip: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
  goToFirstPage: () => void;
  goToLastPage: () => void;
}

/**
 * 分页管理 Hook
 * 提供统一的分页状态管理和工具函数
 */
export function usePagination(options: UsePaginationOptions = {}): UsePaginationReturn {
  const {
    initialPage = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    initialTotal = 0,
  } = options;

  // 确保 initialPage 是有效数字
  const safeInitialPage = Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1;
  const safeInitialTotal = Number.isFinite(initialTotal) && initialTotal >= 0 ? initialTotal : 0;

  const [currentPage, setCurrentPage] = useState(safeInitialPage);
  const [totalCount, setTotalCount] = useState(safeInitialTotal);

  // 包装 setCurrentPage，确保不会设置无效值
  const safeSetCurrentPage = useCallback((page: number | ((prev: number) => number)) => {
    setCurrentPage((prev) => {
      const newPage = typeof page === 'function' ? page(prev) : page;
      // 确保新值是有效的正整数
      if (!Number.isFinite(newPage) || newPage < 1) {
        return 1;
      }
      return Math.floor(newPage);
    });
  }, []);

  // 包装 setTotalCount，确保不会设置无效值
  const safeSetTotalCount = useCallback((total: number | ((prev: number) => number)) => {
    setTotalCount((prev) => {
      const newTotal = typeof total === 'function' ? total(prev) : total;
      // 确保新值是有效的非负整数
      if (!Number.isFinite(newTotal) || newTotal < 0) {
        return 0;
      }
      return Math.floor(newTotal);
    });
  }, []);

  const totalPages = useMemo(() => {
    const pages = Math.ceil(totalCount / pageSize);
    return Number.isFinite(pages) && pages > 0 ? pages : 1;
  }, [totalCount, pageSize]);

  const skip = useMemo(() => {
    const calculatedSkip = (currentPage - 1) * pageSize;
    return Number.isFinite(calculatedSkip) && calculatedSkip >= 0 ? calculatedSkip : 0;
  }, [currentPage, pageSize]);

  const hasNextPage = useMemo(
    () => currentPage < totalPages,
    [currentPage, totalPages]
  );

  const hasPreviousPage = useMemo(
    () => currentPage > 1,
    [currentPage]
  );

  const goToNextPage = useCallback(() => {
    if (hasNextPage) {
      safeSetCurrentPage((prev) => prev + 1);
    }
  }, [hasNextPage, safeSetCurrentPage]);

  const goToPreviousPage = useCallback(() => {
    if (hasPreviousPage) {
      safeSetCurrentPage((prev) => prev - 1);
    }
  }, [hasPreviousPage, safeSetCurrentPage]);

  const goToFirstPage = useCallback(() => {
    safeSetCurrentPage(1);
  }, [safeSetCurrentPage]);

  const goToLastPage = useCallback(() => {
    if (totalPages > 0) {
      safeSetCurrentPage(totalPages);
    }
  }, [totalPages, safeSetCurrentPage]);

  return {
    currentPage,
    setCurrentPage: safeSetCurrentPage,
    pageSize,
    totalCount,
    setTotalCount: safeSetTotalCount,
    totalPages,
    skip,
    hasNextPage,
    hasPreviousPage,
    goToNextPage,
    goToPreviousPage,
    goToFirstPage,
    goToLastPage,
  };
}
