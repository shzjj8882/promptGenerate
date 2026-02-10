"use client";

import { useCallback, useRef, useEffect } from "react";
import { getDisplayMessage } from "@/lib/utils/error";
import { showErrorToast } from "@/lib/utils/toast";
import { ApiError } from "@/lib/api/config";

interface UseErrorHandlerOptions {
  showToast?: boolean;
  setError?: (error: string) => void;
  logToConsole?: boolean; // 是否记录到控制台，默认为 true
}

/**
 * 统一错误处理 Hook
 * 提供统一的错误处理和提示功能
 * 
 * 对于业务错误（如 400 状态码的 ApiError），默认不记录到控制台，避免噪音
 */
export function useErrorHandler(options: UseErrorHandlerOptions = {}) {
  const { 
    showToast: defaultShowToast = true, 
    setError: defaultSetError,
    logToConsole: defaultLogToConsole = true,
  } = options;
  
  // 使用 ref 存储最新的 setError 和 showToast，避免依赖变化导致回调函数重新创建
  const setErrorRef = useRef(defaultSetError);
  const showToastRef = useRef(defaultShowToast);
  const logToConsoleRef = useRef(defaultLogToConsole);
  
  // 更新 ref 的值
  useEffect(() => {
    setErrorRef.current = defaultSetError;
    showToastRef.current = defaultShowToast;
    logToConsoleRef.current = defaultLogToConsole;
  }, [defaultSetError, defaultShowToast, defaultLogToConsole]);

  const handleError = useCallback(
    (error: unknown, defaultMessage: string, customOptions?: UseErrorHandlerOptions) => {
      const message = getDisplayMessage(error, defaultMessage);
      
      // 判断是否为业务错误（400 状态码的 ApiError，如登录密码错误）
      const isBusinessError = error instanceof ApiError && error.code === 400;
      
      // 业务错误不记录到控制台，其他错误根据配置决定
      const shouldLog = (customOptions?.logToConsole ?? logToConsoleRef.current) && !isBusinessError;
      
      if (shouldLog) {
        console.error(defaultMessage, error);
      }
      
      const shouldShowToast = customOptions?.showToast ?? showToastRef.current;
      const errorSetter = customOptions?.setError ?? setErrorRef.current;
      
      if (shouldShowToast) {
        showErrorToast(message);
      }
      
      if (errorSetter) {
        errorSetter(message);
      }
      
      return message;
    },
    [] // 空依赖数组，因为使用 ref 存储最新值
  );

  return { handleError };
}
