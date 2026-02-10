"use client";

import { useState, useCallback } from "react";

interface UseFormDialogOptions<T> {
  initialData?: T | null;
  onClose?: () => void;
}

interface UseFormDialogReturn<T> {
  isOpen: boolean;
  editingData: T | null;
  openDialog: (data?: T | null) => void;
  closeDialog: () => void;
  reset: () => void;
}

/**
 * 表单对话框管理 Hook
 * 统一管理表单对话框的打开/关闭状态和编辑数据
 */
export function useFormDialog<T = any>(
  options: UseFormDialogOptions<T> = {}
): UseFormDialogReturn<T> {
  const { initialData = null, onClose } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [editingData, setEditingData] = useState<T | null>(initialData);

  const openDialog = useCallback((data?: T | null) => {
    setEditingData(data ?? null);
    setIsOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setEditingData(null);
    onClose?.();
  }, [onClose]);

  const reset = useCallback(() => {
    setEditingData(null);
  }, []);

  return {
    isOpen,
    editingData,
    openDialog,
    closeDialog,
    reset,
  };
}
