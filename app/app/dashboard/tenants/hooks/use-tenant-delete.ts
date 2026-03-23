import { useState, useCallback } from "react";
import { deleteTenant, Tenant } from "@/lib/api/tenants";
import { getPrompts } from "@/lib/api/prompts";
import { ApiError } from "@/lib/api/config";
import { logger } from "@/lib/utils/logger";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useDeleteConfirm } from "@/hooks/use-delete-confirm";

interface UseTenantDeleteProps {
  tenants: Tenant[];
  currentPage: number;
  onPageChange: (page: number) => void;
  onTenantsChange: (page: number) => Promise<void>;
}

/**
 * 管理租户删除逻辑的 Hook
 */
export function useTenantDelete({
  tenants,
  currentPage,
  onPageChange,
  onTenantsChange,
}: UseTenantDeleteProps) {
  const [hasRelatedData, setHasRelatedData] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [error, setError] = useState<string>("");

  const { handleError } = useErrorHandler({ setError, showToast: false });

  const deleteConfirm = useDeleteConfirm<Tenant>({
    onConfirm: async (tenant) => {
      await deleteTenant(tenant.id);
      setError("");
      if (tenants.length === 1 && currentPage > 1) {
        onPageChange(currentPage - 1);
      } else {
        await onTenantsChange(currentPage);
      }
    },
    onClose: () => {
      setDeleteConfirmName("");
      setHasRelatedData(false);
      setError("");
    },
  });

  const handleDeleteClick = useCallback(async (tenant: Tenant) => {
    setDeleteConfirmName("");
    try {
      const prompts = await getPrompts({ tenant_id: tenant.id, is_default: false }).catch(
        () => []
      );
      setHasRelatedData(prompts.length > 0);
    } catch (err) {
      logger.error("检查租户关联数据失败", err);
      setHasRelatedData(true);
    }
    deleteConfirm.handleDeleteClick(tenant);
  }, [deleteConfirm.handleDeleteClick]);

  const handleConfirmDelete = useCallback(async () => {
    if (
      hasRelatedData &&
      deleteConfirmName !== deleteConfirm.itemToDelete?.name
    ) {
      setError("输入的租户名称不匹配，请重新输入");
      return;
    }
    try {
      await deleteConfirm.handleConfirm();
    } catch (err) {
      if (err instanceof ApiError) {
        handleError(err, err.message, { showToast: false });
      } else {
        handleError(err, "删除租户失败，请稍后重试", { showToast: false });
      }
    }
  }, [
    hasRelatedData,
    deleteConfirmName,
    deleteConfirm.itemToDelete,
    deleteConfirm.handleConfirm,
    handleError,
  ]);

  return {
    deleteDialogOpen: deleteConfirm.open,
    setDeleteDialogOpen: deleteConfirm.setOpen,
    tenantToDelete: deleteConfirm.itemToDelete,
    deleteLoading: deleteConfirm.loading ? deleteConfirm.itemToDelete?.id ?? null : null,
    hasRelatedData,
    setHasRelatedData,
    deleteConfirmName,
    setDeleteConfirmName,
    error,
    setError,
    handleDeleteClick,
    handleConfirmDelete,
  };
}
