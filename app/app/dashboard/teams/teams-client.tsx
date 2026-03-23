"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { observer } from "mobx-react-lite";
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Plus,
  Settings2,
  Users,
  Copy,
  Check,
  KeyRound,
  MoreHorizontal,
} from "@/components/icons";
import { Team, resetTeamAuthcode } from "@/lib/api/teams";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { userStore } from "@/store/user-store";
import { SortIcon } from "@/components/shared/sort-icon";
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog";
import { usePagination } from "@/hooks/use-pagination";
import { ActionButtons } from "@/components/shared/action-buttons";
import { useTeams } from "./hooks/use-teams";
import { useTeamForm } from "./hooks/use-team-form";
import { useTeamMembers } from "./hooks/use-team-members";
import { TeamFormDialog } from "./components/team-form-dialog";
import { TeamMembersDialog } from "./components/team-members-dialog";
import { QuotaManagementDialog } from "./components/quota-management-dialog";
import { useQuotaManagement } from "./hooks/use-quota-management";
import { CopyableCode } from "@/components/shared/copyable-code";

type TeamsClientProps = {
  initialTeams?: Team[];
  initialTotal?: number;
  initialPage?: number;
};

function TeamsClientImpl({
  initialTeams,
  initialTotal,
  initialPage = 1,
}: TeamsClientProps) {
  const { copy } = useCopyToClipboard();
  const [error, setError] = useState<string>("");
  const [resetAuthcodeDialogOpen, setResetAuthcodeDialogOpen] = useState(false);
  const [teamToResetAuthcode, setTeamToResetAuthcode] = useState<Team | null>(null);
  const [resetAuthcodeLoading, setResetAuthcodeLoading] = useState<string | null>(null);

  const {
    currentPage,
    setCurrentPage,
    totalCount,
    setTotalCount,
    totalPages,
  } = usePagination({
    initialPage,
    initialTotal: initialTotal ?? 0,
  });

  const { teams, loading, fetchTeams } = useTeams({
    initialTeams,
    initialTotal,
    initialPage,
    onTotalChange: setTotalCount,
  });

  const teamForm = useTeamForm({
    currentPage,
    setCurrentPage,
    teams,
    fetchTeams,
    setError,
  });
  const {
    register,
    handleSubmit,
    errors,
    isSubmitting,
    isDialogOpen,
    editingTeam,
    closeDialog,
    deleteDialogOpen,
    setDeleteDialogOpen,
    teamToDelete,
    deleteLoading,
    handleCreate,
    handleEdit,
    onSubmit,
    handleDeleteClick,
    handleConfirmDelete,
  } = teamForm;

  // 创建成员变化时的回调，用于刷新团队列表
  const handleMemberChange = useCallback(() => {
    fetchTeams(currentPage);
  }, [fetchTeams, currentPage]);

  const members = useTeamMembers({
    setError,
    onMemberChange: handleMemberChange, // 成员变化时刷新团队列表
  });
  const {
    membersDialogOpen,
    setMembersDialogOpen,
    selectedTeam,
    members: membersList,
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
  } = members;

  const quota = useQuotaManagement({
    setError,
    fetchTeams,
    currentPage,
  });

  // Data Table 状态
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ search: false });

  const renderSortIcon = useCallback((sorted: false | "asc" | "desc") => {
    return <SortIcon sorted={sorted} />;
  }, []);

  useEffect(() => {
    if (initialTeams && initialTeams.length > 0 && currentPage === initialPage) {
      return;
    }
    fetchTeams(currentPage);
  }, [currentPage, initialTeams, initialPage, fetchTeams]);

  useEffect(() => {
    if (membersDialogOpen && selectedTeam && membersPage > 0) {
      loadTeamMembers(selectedTeam.id, membersPage, memberSearchKeyword);
    }
  }, [membersPage, membersDialogOpen, selectedTeam, memberSearchKeyword, loadTeamMembers]);

  const handleResetAuthcodeClick = useCallback((team: Team) => {
    setTeamToResetAuthcode(team);
    setResetAuthcodeDialogOpen(true);
  }, []);

  const handleConfirmResetAuthcode = useCallback(async () => {
    if (!teamToResetAuthcode) return;
    try {
      setResetAuthcodeLoading(teamToResetAuthcode.id);
      await resetTeamAuthcode(teamToResetAuthcode.id);
      setResetAuthcodeDialogOpen(false);
      setTeamToResetAuthcode(null);
      setError("");
      await fetchTeams(currentPage);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("重置认证码失败，请稍后重试");
      }
    } finally {
      setResetAuthcodeLoading(null);
    }
  }, [teamToResetAuthcode, currentPage, fetchTeams]);

  const columns = useMemo<ColumnDef<Team>[]>(
    () => [
      // 用于全局搜索（代码/名称），隐藏不展示
      {
        id: "search",
        accessorFn: (row) => `${row.code} ${row.name}`,
        enableSorting: false,
        enableHiding: false,
        filterFn: "includesString",
        header: () => null,
        cell: () => null,
      },
      {
        id: "quota",
        header: "本月配额",
        cell: ({ row }) => {
          const t = row.original;
          const ym = t.current_month_year_month ?? "";
          const pointsLimit =
            t.current_month_points_limit !== null && t.current_month_points_limit !== undefined
              ? t.current_month_points_limit
              : null;
          return (
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex items-center gap-1">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {ym || "本月"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-muted-foreground">
                  积点:{" "}
                  <span className="font-medium text-foreground">
                    {t.current_month_points_used ?? 0}
                  </span>
                  {pointsLimit && pointsLimit > 0 ? (
                    <>
                      {" / "}
                      <span className="font-medium text-foreground">{pointsLimit}</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">（不限）</span>
                  )}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "code",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            团队代码
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="font-mono text-sm">{row.original.code}</div>
        ),
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            团队名称
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
      },
      {
        accessorKey: "member_count",
        header: "成员数量",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{row.original.member_count ?? 0}</span>
          </div>
        ),
      },
      {
        accessorKey: "authcode",
        header: "API 认证码",
        cell: ({ row }) => <CopyableCode value={row.original.authcode} placeholder="未生成" />,
      },
      {
        accessorKey: "is_active",
        header: "状态",
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? "default" : "secondary"}>
            {row.original.is_active ? "激活" : "禁用"}
          </Badge>
        ),
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            创建时间
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => {
          const date = new Date(row.original.created_at);
          return (
            <div className="text-sm text-muted-foreground">
              {date.toLocaleString("zh-CN")}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">操作</div>,
        cell: ({ row }) => {
          const team = row.original;
          return (
            <ActionButtons
              onEdit={() => handleEdit(team)}
              onDelete={() => handleDeleteClick(team)}
              canEdit={true}
              canDelete={true}
              deleteLoading={deleteLoading === team.id}
              variant="dropdown"
              additionalActions={[
                {
                  label: "查看成员",
                  icon: <Users className="h-4 w-4" />,
                  onClick: () => handleViewMembers(team),
                },
                {
                  label: "重置认证码",
                  icon: <KeyRound className="h-4 w-4" />,
                  onClick: () => handleResetAuthcodeClick(team),
                },
                {
                  label: "管理配额",
                  icon: <Settings2 className="h-4 w-4" />,
                  onClick: () => quota.openQuotaDialog(team),
                },
              ]}
            />
          );
        },
      },
    ],
    [deleteLoading, handleResetAuthcodeClick, handleViewMembers, quota.openQuotaDialog]
  );

  const table = useReactTable({
    data: teams,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // 计算总页数

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title="团队管理"
        description="管理系统中的所有团队（仅超级管理员可见）"
        action={null}
      />

      {/* 列表 + 分页：中间可滚动，分页固定在底部 */}
      <div className="flex flex-1 min-h-0 flex-col gap-4">
        {/* 顶部工具栏（搜索等） */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <Input
              placeholder="搜索团队（代码 / 名称）..."
              value={(table.getColumn("search")?.getFilterValue() as string) ?? ""}
              onChange={(event) => table.getColumn("search")?.setFilterValue(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button size="sm" className="h-9" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              新建团队
            </Button>
          </div>
        </div>

        {/* 团队列表 - 卡片形式 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="pb-2">
                    <div className="h-5 w-24 bg-muted rounded" />
                    <div className="h-4 w-32 bg-muted rounded mt-2" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="h-4 bg-muted rounded w-full" />
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !table.getRowModel().rows?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-muted-foreground">暂无团队数据</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {table.getRowModel().rows.map((row) => {
                const team = row.original;
                return (
                  <Card key={team.id} className="flex flex-col">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base font-mono">{team.code}</CardTitle>
                          <p className="text-sm font-medium text-foreground mt-0.5">{team.name}</p>
                        </div>
                        <ActionButtons
                          onEdit={() => handleEdit(team)}
                          onDelete={() => handleDeleteClick(team)}
                          canEdit={true}
                          canDelete={true}
                          deleteLoading={deleteLoading === team.id}
                          variant="dropdown"
                          additionalActions={[
                            {
                              label: "查看成员",
                              icon: <Users className="h-4 w-4" />,
                              onClick: () => handleViewMembers(team),
                            },
                            {
                              label: "管理配额",
                              icon: <Settings2 className="h-4 w-4" />,
                              onClick: () => quota.openQuotaDialog(team),
                            },
                            { type: "separator" },
                            {
                              label: "复制认证码",
                              icon: <Copy className="h-4 w-4" />,
                              onClick: () => team.authcode && copy(team.authcode),
                            },
                            {
                              label: "重置认证码",
                              icon: <KeyRound className="h-4 w-4" />,
                              onClick: () => handleResetAuthcodeClick(team),
                            },
                          ]}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-3 pt-0">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4 shrink-0" />
                        <span>成员：{team.member_count ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={team.plan_expire_at && new Date(team.plan_expire_at) > new Date() ? "default" : "outline"}
                          className="text-xs"
                        >
                          {team.plan_expire_at && new Date(team.plan_expire_at) > new Date() ? "有合约" : "无合约"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {!loading && teams.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            onPageChange={setCurrentPage}
            disabled={loading}
          />
        )}
      </div>

      {/* 创建/编辑对话框 */}
      <TeamFormDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        editingTeam={editingTeam}
        register={register}
        errors={errors}
        isSubmitting={isSubmitting}
        onSubmit={onSubmit}
        handleSubmit={handleSubmit}
        error={error}
        onClose={closeDialog}
      />

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="确认删除"
        description={`确定要删除团队 ${teamToDelete?.name || ""} 吗？`}
        onConfirm={handleConfirmDelete}
        loading={!!deleteLoading}
      />

      {/* 重置认证码确认对话框 */}
      <DeleteConfirmDialog
        open={resetAuthcodeDialogOpen}
        onOpenChange={(open) => {
          setResetAuthcodeDialogOpen(open);
          if (!open) {
            setError("");
            setTeamToResetAuthcode(null);
          }
        }}
        title="确认重置认证码"
        description={`确定要重置团队 ${teamToResetAuthcode?.name || ""} 的 API 认证码吗？重置后，旧的认证码将立即失效，请确保已通知相关使用方更新认证码。`}
        onConfirm={handleConfirmResetAuthcode}
        loading={resetAuthcodeLoading === teamToResetAuthcode?.id}
      />

      <TeamMembersDialog
        open={membersDialogOpen}
        onOpenChange={setMembersDialogOpen}
        selectedTeam={selectedTeam}
        members={membersList}
        membersLoading={membersLoading}
        membersPage={membersPage}
        membersTotal={membersTotal}
        membersTotalPages={membersTotalPages}
        memberSearchKeyword={memberSearchKeyword}
        onMemberSearchChange={handleMemberSearchChange}
        onPageChange={setMembersPage}
        onCreateMember={handleCreateMember}
        onClose={closeMembersDialog}
        settingAdminLoading={settingAdminLoading}
        adminConfirmDialogOpen={adminConfirmDialogOpen}
        setAdminConfirmDialogOpen={setAdminConfirmDialogOpen}
        memberToUpdate={memberToUpdate}
        newAdminStatus={newAdminStatus}
        onToggleTeamAdmin={handleToggleTeamAdmin}
        onConfirmToggleTeamAdmin={handleConfirmToggleTeamAdmin}
        deleteConfirmDialogOpen={deleteConfirmDialogOpen}
        setDeleteConfirmDialogOpen={setDeleteConfirmDialogOpen}
        memberToDelete={memberToDelete}
        deletingUserId={deletingUserId}
        onDeleteMember={handleDeleteMember}
        onConfirmDeleteMember={handleConfirmDeleteMember}
        onAdminConfirmClose={() => {
          setMemberToUpdate(null);
          setError("");
        }}
        onDeleteConfirmClose={() => {
          setMemberToDelete(null);
          setError("");
        }}
        createMemberDialogOpen={createMemberDialogOpen}
        setCreateMemberDialogOpen={setCreateMemberDialogOpen}
        creatingMember={creatingMember}
        registerMember={registerMember}
        handleSubmitMember={handleSubmitMember}
        memberErrors={memberErrors}
        onResetMember={() => {
          resetMember();
          setError("");
        }}
        onSubmitCreateMember={onSubmitCreateMember}
        error={error}
      />

      <QuotaManagementDialog
        {...quota}
        error={error}
        setError={setError}
      />
    </div>
  );
}

export default observer(TeamsClientImpl);
