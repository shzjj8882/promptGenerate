import { useState, useCallback, useRef } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { getTeamMembers, Team, TeamMember } from "@/lib/api/teams";
import { updateUserAdmin, deleteUserAdmin, UserAdminUpdate } from "@/lib/api/users";
import { register as registerUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/config";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { usePagination } from "@/hooks/use-pagination";
import { useDebouncedCallback } from "@/hooks/use-debounce";
import { logger } from "@/lib/utils/logger";

const memberSchema = yup.object({
  username: yup
    .string()
    .required("用户名不能为空")
    .min(3, "用户名至少需要3个字符")
    .max(50, "用户名不能超过50个字符"),
  email: yup
    .string()
    .required("邮箱不能为空")
    .email("请输入有效的邮箱地址"),
  password: yup
    .string()
    .required("密码不能为空")
    .min(6, "密码至少需要6个字符"),
  fullName: yup.string().max(100, "全名不能超过100个字符"),
});

export type MemberFormData = yup.InferType<typeof memberSchema>;

export interface UseTeamMembersProps {
  setError: (msg: string) => void;
  onMemberChange?: () => void; // 成员变化时的回调（用于刷新团队列表）
}

/**
 * 管理团队成员对话框、加载/设置管理员/删除/创建成员的 Hook
 */
export function useTeamMembers({ setError, onMemberChange }: UseTeamMembersProps) {
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearchKeyword, setMemberSearchKeyword] = useState("");
  const [createMemberDialogOpen, setCreateMemberDialogOpen] = useState(false);
  const [creatingMember, setCreatingMember] = useState(false);

  const [settingAdminLoading, setSettingAdminLoading] = useState<string | null>(null);
  const [adminConfirmDialogOpen, setAdminConfirmDialogOpen] = useState(false);
  const [memberToUpdate, setMemberToUpdate] = useState<TeamMember | null>(null);
  const [newAdminStatus, setNewAdminStatus] = useState(false);

  const [deleteConfirmDialogOpen, setDeleteConfirmDialogOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const loadingMembersRef = useRef(false);
  const { handleError } = useErrorHandler({ setError, showToast: false });

  const {
    currentPage: membersPage,
    setCurrentPage: setMembersPage,
    totalCount: membersTotal,
    setTotalCount,
    totalPages: membersTotalPages,
  } = usePagination({ initialPage: 1, initialTotal: 0 });

  const {
    register: registerMember,
    handleSubmit: handleSubmitMember,
    formState: { errors: memberErrors },
    reset: resetMember,
  } = useForm<MemberFormData>({
    resolver: yupResolver(memberSchema) as Resolver<MemberFormData>,
  });

  const loadTeamMembers = useCallback(
    async (teamId: string, page: number = 1, search: string = "") => {
      if (loadingMembersRef.current) return;
      try {
        loadingMembersRef.current = true;
        setMembersLoading(true);
        const skip = (page - 1) * DEFAULT_PAGE_SIZE;
        const response = await getTeamMembers(teamId, {
          skip,
          limit: DEFAULT_PAGE_SIZE,
          search: search.trim() || undefined,
        });
        setMembers(response.items);
        setTotalCount(response.total);
      } catch (err) {
        handleError(err, "加载团队成员失败");
      } finally {
        setMembersLoading(false);
        loadingMembersRef.current = false;
      }
    },
    [setTotalCount, handleError]
  );

  const handleViewMembers = useCallback(
    async (team: Team) => {
      setSelectedTeam(team);
      setMembersDialogOpen(true);
      setMembersPage(1);
      setMemberSearchKeyword("");
      await loadTeamMembers(team.id, 1, "");
    },
    [setMembersPage, loadTeamMembers]
  );

  const debouncedSearch = useDebouncedCallback(
    (teamId: string, value: string) => {
      setMembersPage(1);
      loadTeamMembers(teamId, 1, value);
    },
    500
  );

  const handleMemberSearchChange = useCallback(
    (value: string) => {
      setMemberSearchKeyword(value);
      if (selectedTeam) debouncedSearch(selectedTeam.id, value);
    },
    [selectedTeam, debouncedSearch]
  );

  const handleToggleTeamAdmin = useCallback((member: TeamMember) => {
    setMemberToUpdate(member);
    setNewAdminStatus(!member.is_team_admin);
    setAdminConfirmDialogOpen(true);
  }, []);

  const handleConfirmToggleTeamAdmin = useCallback(
    async () => {
      if (!memberToUpdate || !selectedTeam) return;
      try {
        setSettingAdminLoading(memberToUpdate.id);
        const updateData: UserAdminUpdate = { is_team_admin: newAdminStatus };
        await updateUserAdmin(memberToUpdate.id, updateData);
        await loadTeamMembers(selectedTeam.id, membersPage, memberSearchKeyword);
        setAdminConfirmDialogOpen(false);
        setMemberToUpdate(null);
        setError("");
      } catch (err) {
        logger.error("设置团队管理员失败", err);
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("设置团队管理员失败，请稍后重试");
        }
      } finally {
        setSettingAdminLoading(null);
      }
    },
    [
      memberToUpdate,
      selectedTeam,
      newAdminStatus,
      membersPage,
      memberSearchKeyword,
      loadTeamMembers,
      setError,
    ]
  );

  const handleDeleteMember = useCallback((member: TeamMember) => {
    setMemberToDelete(member);
    setDeleteConfirmDialogOpen(true);
  }, []);

  const handleConfirmDeleteMember = useCallback(
    async () => {
      if (!memberToDelete || !selectedTeam) return;
      try {
        setDeletingUserId(memberToDelete.id);
        await deleteUserAdmin(memberToDelete.id);
        await loadTeamMembers(selectedTeam.id, membersPage, memberSearchKeyword);
        // 刷新团队列表以更新成员数量
        if (onMemberChange) {
          onMemberChange();
        }
        setDeleteConfirmDialogOpen(false);
        setMemberToDelete(null);
        setError("");
      } catch (err) {
        logger.error("删除成员失败", err);
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("删除成员失败，请稍后重试");
        }
      } finally {
        setDeletingUserId(null);
      }
    },
    [
      memberToDelete,
      selectedTeam,
      membersPage,
      memberSearchKeyword,
      loadTeamMembers,
      setError,
      onMemberChange,
    ]
  );

  const handleCreateMember = useCallback(() => {
    setCreateMemberDialogOpen(true);
    setError("");
    resetMember({
      username: "",
      email: "",
      password: "",
      fullName: "",
    });
  }, [resetMember, setError]);

  const onSubmitCreateMember = useCallback(
    async (data: MemberFormData) => {
      if (!selectedTeam) return;
      try {
        setCreatingMember(true);
        setError("");
        await registerUser({
          username: data.username,
          email: data.email,
          password: data.password,
          full_name: data.fullName || undefined,
          team_code: selectedTeam.code,
        });
        await loadTeamMembers(selectedTeam.id, membersPage, memberSearchKeyword);
        // 刷新团队列表以更新成员数量
        if (onMemberChange) {
          onMemberChange();
        }
        setCreateMemberDialogOpen(false);
        resetMember();
        setError("");
      } catch (err) {
        if (err instanceof ApiError) {
          handleError(err, err.message, { showToast: false });
        } else {
          handleError(err, "创建成员失败，请稍后重试", { showToast: false });
        }
      } finally {
        setCreatingMember(false);
      }
    },
    [
      selectedTeam,
      membersPage,
      memberSearchKeyword,
      loadTeamMembers,
      resetMember,
      setError,
      handleError,
      onMemberChange,
    ]
  );

  const closeMembersDialog = useCallback(() => {
    setSelectedTeam(null);
    setMembers([]);
    setMembersPage(1);
    setTotalCount(0);
    setMemberSearchKeyword("");
  }, [setMembersPage, setTotalCount]);

  return {
    membersDialogOpen,
    setMembersDialogOpen,
    selectedTeam,
    setSelectedTeam,
    members,
    membersLoading,
    membersPage,
    setMembersPage,
    membersTotal,
    membersTotalPages,
    memberSearchKeyword,
    handleMemberSearchChange,
    loadTeamMembers,
    handleViewMembers,
    settingAdminLoading,
    adminConfirmDialogOpen,
    setAdminConfirmDialogOpen,
    memberToUpdate,
    setMemberToUpdate,
    newAdminStatus,
    handleToggleTeamAdmin,
    handleConfirmToggleTeamAdmin,
    deleteConfirmDialogOpen,
    setDeleteConfirmDialogOpen,
    memberToDelete,
    setMemberToDelete,
    deletingUserId,
    handleDeleteMember,
    handleConfirmDeleteMember,
    createMemberDialogOpen,
    setCreateMemberDialogOpen,
    creatingMember,
    registerMember,
    handleSubmitMember,
    memberErrors,
    resetMember,
    handleCreateMember,
    onSubmitCreateMember,
    closeMembersDialog,
  };
}
