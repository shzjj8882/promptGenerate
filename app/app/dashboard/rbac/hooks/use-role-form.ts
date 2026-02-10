import { useState, useCallback } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import {
  createRole,
  updateRole,
  deleteRole,
  Role,
  RoleCreate,
  RoleUpdate,
} from "@/lib/api/rbac";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { showSuccessToast, showErrorToast } from "@/lib/utils/toast";
import { getDisplayMessage } from "@/lib/utils/error";
import { logger } from "@/lib/utils/logger";

const roleSchema = yup.object({
  name: yup.string().required("角色名称不能为空").min(1, "角色名称至少需要1个字符"),
  code: yup
    .string()
    .required("角色代码不能为空")
    .matches(/^[a-zA-Z0-9_-]+$/, "角色代码只能包含字母、数字、下划线和连字符"),
  description: yup.string().optional(),
  is_active: yup.boolean().optional(),
});

export type RoleFormData = yup.InferType<typeof roleSchema>;

export interface UseRoleFormProps {
  rolesPage: number;
  setRolesPage: (page: number) => void;
  roles: Role[];
  fetchRoles: (page: number) => Promise<void>;
  fetchAllRoles: () => Promise<void>;
}

/**
 * 管理角色表单、创建/编辑/删除/激活状态切换的 Hook
 */
export function useRoleForm({
  rolesPage,
  setRolesPage,
  roles,
  fetchRoles,
  fetchAllRoles,
}: UseRoleFormProps) {
  const [roleError, setRoleError] = useState<string>("");
  const { handleError: handleRoleError } = useErrorHandler({
    setError: setRoleError,
    showToast: false,
  });

  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [rolePermissionTab, setRolePermissionTab] = useState<"menu" | "api">("menu");
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);

  const [deleteRoleDialogOpen, setDeleteRoleDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [deleteRoleLoading, setDeleteRoleLoading] = useState(false);
  const [roleTogglingId, setRoleTogglingId] = useState<string | null>(null);

  const {
    register: registerRole,
    handleSubmit: handleSubmitRole,
    formState: { errors: roleErrors, isSubmitting: isRoleSubmitting },
    reset: resetRole,
  } = useForm<RoleFormData>({
    resolver: yupResolver(roleSchema) as Resolver<RoleFormData>,
    defaultValues: { name: "", code: "", description: "", is_active: true },
  });

  const handleCreateRole = useCallback(() => {
    setEditingRole(null);
    setRoleError("");
    setSelectedPermissionIds([]);
    resetRole({
      name: "",
      code: "",
      description: "",
      is_active: true,
    });
    setIsRoleDialogOpen(true);
  }, [resetRole]);

  const handleEditRole = useCallback(
    async (role: Role) => {
      try {
        setEditingRole(role);
        setRoleError("");
        setSelectedPermissionIds(role.permissions.map((p) => p.id));
        resetRole({
          name: role.name,
          code: role.code,
          description: role.description || "",
          is_active: role.is_active,
        });
        setIsRoleDialogOpen(true);
      } catch (err) {
        handleRoleError(err, "获取角色详情失败");
      }
    },
    [resetRole, handleRoleError]
  );

  const onSubmitRole = useCallback(
    async (data: RoleFormData) => {
      setRoleError("");
      try {
        if (editingRole) {
          const updateData: RoleUpdate = {
            name: data.name,
            description: data.description || undefined,
            permission_ids: selectedPermissionIds,
          };
          await updateRole(editingRole.id, updateData);
        } else {
          const createData: RoleCreate = {
            name: data.name,
            code: data.code,
            description: data.description || undefined,
            is_active: data.is_active ?? true,
            permission_ids: selectedPermissionIds,
          };
          await createRole(createData);
        }
        setIsRoleDialogOpen(false);
        await fetchRoles(rolesPage);
        await fetchAllRoles();
      } catch (err) {
        handleRoleError(err, "保存角色失败，请稍后重试");
      }
    },
    [
      editingRole,
      selectedPermissionIds,
      rolesPage,
      fetchRoles,
      fetchAllRoles,
      handleRoleError,
    ]
  );

  const handleRoleActiveToggle = useCallback(
    async (role: Role) => {
      try {
        setRoleTogglingId(role.id);
        await updateRole(role.id, { is_active: !role.is_active });
        await fetchRoles(rolesPage);
        await fetchAllRoles();
        showSuccessToast(role.is_active ? "已设为未激活" : "已设为已激活");
      } catch (err) {
        logger.error("切换激活状态失败", err);
        showErrorToast(getDisplayMessage(err, "切换激活状态失败"));
      } finally {
        setRoleTogglingId(null);
      }
    },
    [rolesPage, fetchRoles, fetchAllRoles]
  );

  const handleDeleteRoleClick = useCallback((role: Role) => {
    setRoleToDelete(role);
    setDeleteRoleDialogOpen(true);
  }, []);

  const handleConfirmDeleteRole = useCallback(
    async () => {
      if (!roleToDelete) return;
      try {
        setDeleteRoleLoading(true);
        await deleteRole(roleToDelete.id);
        setDeleteRoleDialogOpen(false);
        setRoleToDelete(null);
        setRoleError("");
        if (roles.length === 1 && rolesPage > 1) {
          setRolesPage(rolesPage - 1);
        } else {
          await fetchRoles(rolesPage);
        }
        await fetchAllRoles();
      } catch (err) {
        handleRoleError(err, "删除角色失败，请稍后重试");
      } finally {
        setDeleteRoleLoading(false);
      }
    },
    [
      roleToDelete,
      roles.length,
      rolesPage,
      setRolesPage,
      fetchRoles,
      fetchAllRoles,
      handleRoleError,
    ]
  );

  const togglePermissionSelection = useCallback((permissionId: string) => {
    setSelectedPermissionIds((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId]
    );
  }, []);

  const toggleCardPermissionSelection = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setSelectedPermissionIds((prev) => {
      const allSelected = ids.every((id) => prev.includes(id));
      return allSelected
        ? prev.filter((id) => !ids.includes(id))
        : [...new Set([...prev, ...ids])];
    });
  }, []);

  const closeRoleDialog = useCallback(() => {
    setRoleError("");
    resetRole();
    setRolePermissionTab("menu");
    setSelectedPermissionIds([]);
  }, [resetRole]);

  return {
    registerRole,
    handleSubmitRole,
    roleErrors,
    isRoleSubmitting,
    resetRole,
    roleError,
    setRoleError,
    isRoleDialogOpen,
    setIsRoleDialogOpen,
    editingRole,
    setEditingRole,
    rolePermissionTab,
    setRolePermissionTab,
    selectedPermissionIds,
    setSelectedPermissionIds,
    deleteRoleDialogOpen,
    setDeleteRoleDialogOpen,
    roleToDelete,
    setRoleToDelete,
    deleteRoleLoading,
    roleTogglingId,
    handleCreateRole,
    handleEditRole,
    onSubmitRole,
    handleRoleActiveToggle,
    handleDeleteRoleClick,
    handleConfirmDeleteRole,
    togglePermissionSelection,
    toggleCardPermissionSelection,
    closeRoleDialog,
  };
}
