"use client";

import { useState, useCallback, useMemo } from "react";
import { useDebounce } from "./use-debounce";

interface UseSearchOptions {
  debounceDelay?: number;
  initialValue?: string;
}

interface UseSearchReturn {
  searchQuery: string;
  debouncedSearchQuery: string;
  setSearchQuery: (query: string) => void;
  clearSearch: () => void;
}

/**
 * 搜索管理 Hook
 * 提供统一的搜索状态管理和防抖功能
 */
export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
  const { debounceDelay = 300, initialValue = "" } = options;
  
  const [searchQuery, setSearchQuery] = useState(initialValue);
  const debouncedSearchQuery = useDebounce(searchQuery, debounceDelay);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  return {
    searchQuery,
    debouncedSearchQuery,
    setSearchQuery,
    clearSearch,
  };
}
