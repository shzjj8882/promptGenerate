import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { createTenant, updateTenant, getTenant, Tenant, TenantCreate, TenantUpdate, TenantDetail } from "@/lib/api/tenants";
import { ApiError } from "@/lib/api/config";
import { logger } from "@/lib/utils/logger";
import { useFormDialog } from "@/hooks/use-form-dialog";

type TenantFormData = {
  code_id: string;
  name: string;
  app_id?: string;
  app_secret?: string;
};

const tenantSchema: yup.ObjectSchema<TenantFormData> = yup.object({
  code_id: yup
    .string()
    .required("租户编号不能为空")
    .matches(/^[a-zA-Z0-9_-]+$/, "租户编号只能包含字母、数字、下划线和连字符"),
  name: yup
    .string()
    .required("租户名称不能为空")
    .min(2, "租户名称至少需要2个字符"),
  app_id: yup.string().optional(),
  app_secret: yup.string().optional(),
}) as yup.ObjectSchema<TenantFormData>;

interface UseTenantFormProps {
  onTenantsChange: () => Promise<void>;
}

/**
 * 管理租户表单状态和提交逻辑的 Hook
 */
export function useTenantForm({ onTenantsChange }: UseTenantFormProps) {
  const [editingTenantDetail, setEditingTenantDetail] = useState<TenantDetail | null>(null);
  const [error, setError] = useState<string>("");
  
  const {
    isOpen: isDialogOpen,
    editingData: editingTenant,
    openDialog: openFormDialog,
    closeDialog: closeFormDialog,
    reset: resetFormDialog,
  } = useFormDialog<Tenant>();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<TenantFormData>({
    resolver: yupResolver(tenantSchema) as any,
  });

  // 打开创建对话框
  const handleCreate = useCallback(() => {
    setEditingTenantDetail(null);
    setError("");
    reset({
      code_id: "",
      name: "",
      app_id: "" as string | undefined,
      app_secret: "" as string | undefined,
    });
    openFormDialog(null);
  }, [reset, openFormDialog]);

  // 打开编辑对话框
  const handleEdit = useCallback(async (tenant: Tenant) => {
    try {
      setError("");
      // 获取完整的租户信息（包含 app_id 和 app_secret）
      const tenantDetail = await getTenant(tenant.id);
      setEditingTenantDetail(tenantDetail);
      reset({
        code_id: tenantDetail.code_id,
        name: tenantDetail.name,
        app_id: (tenantDetail.app_id || "") as string | undefined,
        app_secret: (tenantDetail.app_secret || "") as string | undefined,
      });
      openFormDialog(tenant);
    } catch (err) {
      logger.error("获取租户详情失败", err);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("获取租户详情失败");
      }
    }
  }, [reset, openFormDialog]);

  // 提交表单
  const onSubmit = useCallback(async (data: TenantFormData) => {
    setError("");
    try {
      if (editingTenant) {
        // 更新租户
        const updateData: TenantUpdate = {
          code_id: data.code_id,
          name: data.name,
          app_id: data.app_id || undefined,
          app_secret: data.app_secret || undefined,
        };
        await updateTenant(editingTenant.id, updateData);
      } else {
        // 创建租户
        const createData: TenantCreate = {
          code_id: data.code_id,
          name: data.name,
          app_id: data.app_id || undefined,
          app_secret: data.app_secret || undefined,
        };
        await createTenant(createData);
      }
      closeFormDialog();
      resetFormDialog();
      await onTenantsChange();
    } catch (err) {
      logger.error("保存租户失败", err);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("保存租户失败，请稍后重试");
      }
    }
  }, [editingTenant, closeFormDialog, resetFormDialog, onTenantsChange]);

  return {
    isDialogOpen,
    editingTenant,
    editingTenantDetail,
    error,
    setError,
    register,
    handleSubmit,
    errors,
    isSubmitting,
    reset,
    handleCreate,
    handleEdit,
    onSubmit,
    closeFormDialog,
  };
}
