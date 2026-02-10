import { useState, useCallback } from "react";
import { deleteTenant, Tenant } from "@/lib/api/tenants";
import { getPrompts } from "@/lib/api/prompts";
import { ApiError } from "@/lib/api/config";
import { logger } from "@/lib/utils/logger";
import { useErrorHandler } from "@/hooks/use-error-handler";

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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [hasRelatedData, setHasRelatedData] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [error, setError] = useState<string>("");
  
  const { handleError } = useErrorHandler({ setError, showToast: false });

  const handleDeleteClick = useCallback(async (tenant: Tenant) => {
    setTenantToDelete(tenant);
    setDeleteConfirmName("");
    
    // 检查租户是否有关联的提示词
    try {
      const prompts = await getPrompts({ tenant_id: tenant.id, is_default: false }).catch(() => []);
      setHasRelatedData(prompts.length > 0);
    } catch (error) {
      logger.error("检查租户关联数据失败", error);
      // 如果检查失败，为了安全起见，假设有关联数据
      setHasRelatedData(true);
    }
    
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!tenantToDelete) return;

    // 如果有关联数据，需要验证输入的名称
    if (hasRelatedData && deleteConfirmName !== tenantToDelete.name) {
      setError("输入的租户名称不匹配，请重新输入");
      return;
    }

    try {
      setDeleteLoading(tenantToDelete.id);
      await deleteTenant(tenantToDelete.id);
      setDeleteDialogOpen(false);
      setTenantToDelete(null);
      setDeleteConfirmName("");
      setHasRelatedData(false);
      setError("");
      
      // 如果当前页没有数据了，返回上一页
      if (tenants.length === 1 && currentPage > 1) {
        onPageChange(currentPage - 1);
      } else {
        await onTenantsChange(currentPage);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        handleError(err, err.message, { showToast: false });
      } else {
        handleError(err, "删除租户失败，请稍后重试", { showToast: false });
      }
    } finally {
      setDeleteLoading(null);
    }
  }, [tenantToDelete, hasRelatedData, deleteConfirmName, tenants, currentPage, onPageChange, onTenantsChange, handleError]);

  return {
    deleteDialogOpen,
    setDeleteDialogOpen,
    tenantToDelete,
    deleteLoading,
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
