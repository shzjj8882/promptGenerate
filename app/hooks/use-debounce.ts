"use client";

/**
 * 防抖 Hooks - 基于 use-debounce 库
 * @see https://github.com/xnimorz/use-debounce
 */

import { useDebounce as useDebounceLib } from "use-debounce";
import { useDebouncedCallback as useDebouncedCallbackLib } from "use-debounce";

/**
 * 防抖 Hook（值）
 * @param value 需要防抖的值
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的值
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue] = useDebounceLib(value, delay);
  return debouncedValue;
}

/**
 * 防抖回调 Hook
 * @param callback 需要防抖的回调函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的回调函数（含 cancel、flush、isPending 方法）
 */
export function useDebouncedCallback<T extends (...args: Parameters<T>) => ReturnType<T>>(
  callback: T,
  delay: number
): T {
  return useDebouncedCallbackLib(callback, delay) as unknown as T;
}
