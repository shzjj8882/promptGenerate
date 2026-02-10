import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createTable, MultiDimensionTable, MultiDimensionTableCreate } from "@/lib/api/multi-dimension-tables";
import { useErrorHandler } from "@/hooks/use-error-handler";

interface UseTableFormProps {
  canCreateApi: boolean;
  tables: MultiDimensionTable[];
  onTablesChange: () => Promise<void>;
}

export function useTableForm({
  canCreateApi,
  tables,
  onTablesChange,
}: UseTableFormProps) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTableCode, setNewTableCode] = useState("");
  const [newTableName, setNewTableName] = useState("");
  const [newTableDescription, setNewTableDescription] = useState("");

  const { handleError } = useErrorHandler({ setError, showToast: false });

  const handleCreate = useCallback(() => {
    if (!canCreateApi) {
      setError("没有创建权限");
      return;
    }
    setNewTableCode("");
    setNewTableName("");
    setNewTableDescription("");
    setError("");
    setIsDialogOpen(true);
  }, [canCreateApi]);

  const handleSubmit = useCallback(async () => {
    if (!newTableCode.trim()) {
      setError("请输入表格代码");
      return;
    }
    if (!newTableName.trim()) {
      setError("请输入表格名称");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      const newTable = await createTable({
        code: newTableCode.trim(),
        name: newTableName.trim(),
        description: newTableDescription.trim(),
        columns: [],
      });
      setIsDialogOpen(false);
      await onTablesChange();
      // 跳转到新创建的表格详情页
      router.push(`/dashboard/tables/${newTable.id}`);
    } catch (err) {
      handleError(err, "创建表格失败");
    } finally {
      setIsSubmitting(false);
    }
  }, [newTableCode, newTableName, newTableDescription, onTablesChange, router, handleError]);

  const handleCancel = useCallback(() => {
    setIsDialogOpen(false);
    setNewTableCode("");
    setNewTableName("");
    setNewTableDescription("");
    setError("");
  }, []);

  return {
    isDialogOpen,
    setIsDialogOpen,
    error,
    setError,
    isSubmitting,
    newTableCode,
    setNewTableCode,
    newTableName,
    setNewTableName,
    newTableDescription,
    setNewTableDescription,
    handleCreate,
    handleSubmit,
    handleCancel,
  };
}
