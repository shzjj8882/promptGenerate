"use client";

import { useCallback, useRef, useState } from "react";
import {
  getCompositions,
  createComposition,
  updateComposition,
  deleteComposition,
  type Composition,
  type CompositionCreate,
  type CompositionUpdate,
} from "@/lib/api/compositions";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { usePagination } from "@/hooks/use-pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

export function useCompositions() {
  const [compositions, setCompositions] = useState<Composition[]>([]);
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const pageRef = useRef(1);
  const keywordRef = useRef("");

  const {
    currentPage,
    setCurrentPage,
    totalCount,
    setTotalCount,
    totalPages,
  } = usePagination({ initialPage: 1, pageSize: DEFAULT_PAGE_SIZE, initialTotal: 0 });

  pageRef.current = currentPage;
  keywordRef.current = searchKeyword;

  const { handleError } = useErrorHandler({ showToast: true });

  const fetchCompositions = useCallback(
    async (page: number, keyword: string) => {
      if (loadingRef.current) return;
      if (!Number.isFinite(page) || page < 1) return;
      try {
        loadingRef.current = true;
        setLoading(true);
        const skip = (page - 1) * DEFAULT_PAGE_SIZE;
        const res = await getCompositions({
          skip,
          limit: DEFAULT_PAGE_SIZE,
          keyword: keyword.trim() || undefined,
        });
        setCompositions(res.items);
        setTotalCount(res.total);
      } catch (error) {
        handleError(error, "加载组合列表失败");
        setCompositions([]);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [handleError, setTotalCount]
  );

  const refetch = useCallback(() => {
    fetchCompositions(pageRef.current, keywordRef.current);
  }, [fetchCompositions]);

  const create = useCallback(
    async (data: CompositionCreate) => {
      const created = await createComposition(data);
      refetch();
      return created;
    },
    [refetch]
  );

  const update = useCallback(
    async (id: string, data: CompositionUpdate) => {
      const updated = await updateComposition(id, data);
      refetch();
      return updated;
    },
    [refetch]
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteComposition(id);
      refetch();
    },
    [refetch]
  );

  return {
    compositions,
    loading,
    fetchCompositions,
    create,
    update,
    remove,
    currentPage,
    setCurrentPage,
    totalCount,
    totalPages,
    searchKeyword,
    setSearchKeyword,
  };
}
