import { useState, useCallback } from "react";

export interface UseDeleteConfirmOptions<T> {
  /** 确认删除时执行，传入待删除项 */
  onConfirm: (item: T) => void | Promise<void>;
  /** 对话框关闭时执行（如 setError("")） */
  onClose?: () => void;
}

export interface UseDeleteConfirmReturn<T> {
  open: boolean;
  setOpen: (open: boolean) => void;
  itemToDelete: T | null;
  handleDeleteClick: (item: T) => void;
  handleConfirm: () => Promise<void>;
  loading: boolean;
}

/**
 * 统一删除确认的 open/loading/onConfirm 状态
 * 与 DeleteConfirmDialog 配合使用
 */
export function useDeleteConfirm<T>(
  options: UseDeleteConfirmOptions<T>
): UseDeleteConfirmReturn<T> {
  const { onConfirm, onClose } = options;
  const [open, setOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDeleteClick = useCallback((item: T) => {
    setItemToDelete(item);
    setOpen(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!itemToDelete) return;
    try {
      setLoading(true);
      await onConfirm(itemToDelete);
      setOpen(false);
      setItemToDelete(null);
      onClose?.();
    } finally {
      setLoading(false);
    }
  }, [itemToDelete, onConfirm, onClose]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        setItemToDelete(null);
        onClose?.();
      }
    },
    [onClose]
  );

  return {
    open,
    setOpen: handleOpenChange,
    itemToDelete,
    handleDeleteClick,
    handleConfirm,
    loading,
  };
}
