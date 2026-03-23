"use client";

import { useState, useCallback } from "react";

interface UseCopyToClipboardOptions {
  /** 复制成功后重置 copied 状态的延迟（毫秒），默认 2000 */
  resetDelay?: number;
}

interface UseCopyToClipboardReturn {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
  /** 手动重置 copied 状态（如对话框关闭时） */
  resetCopied: () => void;
}

/**
 * 复制文本到剪贴板 Hook
 * 支持复制成功反馈、自动重置
 */
export function useCopyToClipboard(
  options: UseCopyToClipboardOptions = {}
): UseCopyToClipboardReturn {
  const { resetDelay = 2000 } = options;
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      if (!text) return false;
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (resetDelay > 0) {
          setTimeout(() => setCopied(false), resetDelay);
        }
        return true;
      } catch (err) {
        console.error("复制失败:", err);
        return false;
      }
    },
    [resetDelay]
  );

  const resetCopied = useCallback(() => setCopied(false), []);

  return { copied, copy, resetCopied };
}
