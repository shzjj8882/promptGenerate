"use client";

import { useCallback, useRef, useState } from "react";
import { getDisplayMessage } from "@/lib/utils/error";

interface UseAsyncOperationOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
  showErrorToast?: boolean;
  preventDuplicate?: boolean;
}

interface UseAsyncOperationReturn<T> {
  execute: (operation: () => Promise<T>) => Promise<T | undefined>;
  loading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
}

/**
 * 异步操作管理 Hook
 * 统一管理异步操作的 loading、error 状态和请求去重
 */
export function useAsyncOperation<T = void>(
  options: UseAsyncOperationOptions<T> = {}
): UseAsyncOperationReturn<T> {
  const {
    onSuccess,
    onError,
    showErrorToast = false,
    preventDuplicate = true,
  } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const execute = useCallback(
    async (operation: () => Promise<T>): Promise<T | undefined> => {
      // 防止重复请求
      if (preventDuplicate && loadingRef.current) {
        return undefined;
      }

      try {
        loadingRef.current = true;
        setLoading(true);
        setError(null);

        const result = await operation();

        if (onSuccess) {
          onSuccess(result);
        }

        return result;
      } catch (err) {
        const errorMessage = getDisplayMessage(err, "操作失败，请稍后重试");
        setError(errorMessage);

        if (onError) {
          onError(errorMessage);
        }

        if (showErrorToast) {
          const { showErrorToast: showToast } = await import("@/lib/utils/toast");
          showToast(errorMessage);
        }

        console.error("异步操作失败:", err);
        return undefined;
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [onSuccess, onError, showErrorToast, preventDuplicate]
  );

  return {
    execute,
    loading,
    error,
    setError,
  };
}
