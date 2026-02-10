import { useState, useCallback } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import {
  createTeam,
  updateTeam,
  deleteTeam,
  Team,
  TeamCreate,
  TeamUpdate,
} from "@/lib/api/teams";
import { ApiError } from "@/lib/api/config";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useFormDialog } from "@/hooks/use-form-dialog";
import { logger } from "@/lib/utils/logger";

const teamSchema = yup.object({
  code: yup
    .string()
    .required("团队代码不能为空")
    .min(2, "团队代码至少需要2个字符")
    .max(50, "团队代码不能超过50个字符")
    .matches(/^[a-zA-Z0-9_-]+$/, "团队代码只能包含字母、数字、下划线和连字符"),
  name: yup
    .string()
    .required("团队名称不能为空")
    .min(1, "团队名称至少需要1个字符")
    .max(100, "团队名称不能超过100个字符"),
});

export type TeamFormData = yup.InferType<typeof teamSchema>;

export interface UseTeamFormProps {
  currentPage: number;
  setCurrentPage: (page: number) => void;
  teams: Team[];
  fetchTeams: (page: number) => Promise<void>;
  setError: (msg: string) => void;
}

/**
 * 管理团队表单、创建/编辑/删除的 Hook
 */
export function useTeamForm({
  currentPage,
  setCurrentPage,
  teams,
  fetchTeams,
  setError,
}: UseTeamFormProps) {
  const { handleError } = useErrorHandler({ setError, showToast: false });

  const {
    isOpen: isDialogOpen,
    editingData: editingTeam,
    openDialog: openFormDialog,
    closeDialog: closeFormDialog,
    reset: resetFormDialog,
  } = useFormDialog<Team>();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<TeamFormData>({
    resolver: yupResolver(teamSchema) as Resolver<TeamFormData>,
  });

  const handleCreate = useCallback(() => {
    setError("");
    reset({ code: "", name: "" });
    openFormDialog(null);
  }, [reset, openFormDialog]);

  const handleEdit = useCallback(
    (team: Team) => {
      setError("");
      reset({ code: team.code, name: team.name });
      openFormDialog(team);
    },
    [reset, openFormDialog]
  );

  const onSubmit = useCallback(
    async (data: TeamFormData) => {
      setError("");
      try {
        if (editingTeam) {
          const updateData: TeamUpdate = { name: data.name };
          await updateTeam(editingTeam.id, updateData);
        } else {
          const createData: TeamCreate = { code: data.code, name: data.name };
          await createTeam(createData);
        }
        closeFormDialog();
        resetFormDialog();
        await fetchTeams(currentPage);
      } catch (err) {
        logger.error("保存团队失败", err);
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("保存团队失败，请稍后重试");
        }
      }
    },
    [editingTeam, currentPage, closeFormDialog, resetFormDialog, fetchTeams]
  );

  const handleDeleteClick = useCallback((team: Team) => {
    setTeamToDelete(team);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(
    async () => {
      if (!teamToDelete) return;
      try {
        setDeleteLoading(teamToDelete.id);
        await deleteTeam(teamToDelete.id);
        setDeleteDialogOpen(false);
        setTeamToDelete(null);
        setError("");
        if (teams.length === 1 && currentPage > 1) {
          setCurrentPage(currentPage - 1);
        } else {
          await fetchTeams(currentPage);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          handleError(err, err.message, { showToast: false });
        } else {
          handleError(err, "删除团队失败，请稍后重试", { showToast: false });
        }
      } finally {
        setDeleteLoading(null);
      }
    },
    [
      teamToDelete,
      teams.length,
      currentPage,
      setCurrentPage,
      fetchTeams,
      handleError,
    ]
  );

  const closeDialog = useCallback(() => {
    closeFormDialog();
    setError("");
    reset();
  }, [closeFormDialog, reset]);

  return {
    register,
    handleSubmit,
    errors,
    isSubmitting,
    reset,
    isDialogOpen,
    editingTeam,
    openFormDialog,
    closeFormDialog,
    closeDialog,
    deleteDialogOpen,
    setDeleteDialogOpen,
    teamToDelete,
    setTeamToDelete,
    deleteLoading,
    handleCreate,
    handleEdit,
    onSubmit,
    handleDeleteClick,
    handleConfirmDelete,
  };
}
