import { useState, useCallback } from "react";
import { deleteTable, MultiDimensionTable } from "@/lib/api/multi-dimension-tables";
import { useErrorHandler } from "@/hooks/use-error-handler";

interface UseTableDeleteProps {
  canDeleteApi: boolean;
  tables: MultiDimensionTable[];
  currentPage: number;
  onPageChange: (page: number) => void;
  onTablesChange: () => Promise<void>;
}

export function useTableDelete({
  canDeleteApi,
  tables,
  currentPage,
  onPageChange,
  onTablesChange,
}: UseTableDeleteProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<MultiDimensionTable | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState("");

  const { handleError } = useErrorHandler({ setError, showToast: false });

  const handleDeleteClick = useCallback((table: MultiDimensionTable) => {
    if (!canDeleteApi) {
      setError("没有删除权限");
      return;
    }
    setTableToDelete(table);
    setDeleteDialogOpen(true);
    setError("");
  }, [canDeleteApi]);

  const handleConfirmDelete = useCallback(async () => {
    if (!tableToDelete) return;

    try {
      setDeleteLoading(true);
      setError("");
      await deleteTable(tableToDelete.id);
      
      // 如果当前页没有数据了，且不是第一页，则跳转到上一页
      if (tables.length === 1 && Number.isFinite(currentPage) && currentPage > 1) {
        const newPage = currentPage - 1;
        if (Number.isFinite(newPage) && newPage >= 1) {
          onPageChange(newPage);
          // onPageChange 会触发 useEffect 刷新列表，所以这里不需要再调用 onTablesChange
        } else {
          onPageChange(1);
          // onPageChange 会触发 useEffect 刷新列表，所以这里不需要再调用 onTablesChange
        }
      } else {
        // 刷新当前页的列表
        await onTablesChange();
      }
      
      setDeleteDialogOpen(false);
      setTableToDelete(null);
    } catch (err) {
      handleError(err, "删除表格失败");
    } finally {
      setDeleteLoading(false);
    }
  }, [tableToDelete, tables.length, currentPage, onPageChange, onTablesChange, handleError]);

  return {
    deleteDialogOpen,
    setDeleteDialogOpen,
    tableToDelete,
    deleteLoading,
    error,
    handleDeleteClick,
    handleConfirmDelete,
  };
}
