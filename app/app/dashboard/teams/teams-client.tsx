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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MemoizedTableRow } from "@/components/shared/memoized-table-row";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Plus,
  Settings2,
  Users,
  Shield,
  ShieldOff,
  Search,
  Trash2,
  Copy,
  Check,
  KeyRound,
} from "lucide-react";
import { Team, TeamMember, resetTeamAuthcode } from "@/lib/api/teams";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { userStore } from "@/store/user-store";
import { SortIcon } from "@/components/shared/sort-icon";
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog";
import { usePagination } from "@/hooks/use-pagination";
import { TableState } from "@/components/shared/table-state";
import { ActionButtons } from "@/components/shared/action-buttons";
import { TableSkeleton } from "@/components/shared/table-skeleton";
import { useTeams } from "./hooks/use-teams";
import { useTeamForm } from "./hooks/use-team-form";
import { useTeamMembers } from "./hooks/use-team-members";
import { TeamFormDialog } from "./components/team-form-dialog";

type TeamsClientProps = {
  initialTeams?: Team[];
  initialTotal?: number;
  initialPage?: number;
};

// 复制认证码组件
function AuthCodeCell({ authcode }: { authcode?: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = useCallback(async () => {
    if (!authcode) return;
    try {
      await navigator.clipboard.writeText(authcode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  }, [authcode]);
  
  if (!authcode) {
    return <span className="text-sm text-muted-foreground">未生成</span>;
  }
  
  return (
    <div className="flex items-center gap-2">
      <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
        {authcode.substring(0, 8)}...
      </code>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={handleCopy}
        title="复制认证码"
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

function TeamsClientImpl({
  initialTeams,
  initialTotal,
  initialPage = 1,
}: TeamsClientProps) {
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
    setTeamToDelete,
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

  // Data Table 状态
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ search: false });

  const columnsToggleable = useMemo(
    () => [
      { id: "code", label: "团队代码" },
      { id: "name", label: "团队名称" },
      { id: "member_count", label: "成员数量" },
      { id: "authcode", label: "API 认证码" },
      { id: "created_at", label: "创建时间" },
    ],
    []
  );

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
        cell: ({ row }) => <AuthCodeCell authcode={row.original.authcode} />,
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
              ]}
            />
          );
        },
      },
    ],
    [deleteLoading, handleResetAuthcodeClick]
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <Settings2 className="mr-2 h-4 w-4" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px]">
                <DropdownMenuLabel>显示列</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columnsToggleable.map((c) => {
                  const col = table.getColumn(c.id);
                  if (!col) return null;
                  return (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={col.getIsVisible()}
                      onCheckedChange={(value) => col.toggleVisibility(!!value)}
                    >
                      {c.label}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="h-9" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              新建团队
            </Button>
          </div>
        </div>

        {/* 团队列表 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="overflow-hidden rounded-md border bg-background">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="bg-muted/40">
                    {headerGroup.headers
                      .filter((h) => h.column.id !== "search")
                      .map((header) => (
                        <TableHead
                          key={header.id}
                          className={[
                            "h-12 px-4 align-middle",
                            header.column.id === "actions" ? "text-right" : "",
                          ].join(" ")}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableSkeleton rows={5} cols={5} />
                ) : (
                  <>
                    <TableState
                      loading={false}
                      empty={!table.getRowModel().rows?.length}
                      colSpan={5}
                      emptyText="暂无团队数据"
                    />
                    {table.getRowModel().rows?.length > 0 &&
                      table.getRowModel().rows.map((row) => (
                        <MemoizedTableRow key={row.id} row={row} />
                      ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
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
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setError("");
          }
        }}
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

      {/* 团队成员对话框 */}
      <Dialog
        open={membersDialogOpen}
        onOpenChange={(open) => {
          setMembersDialogOpen(open);
          if (!open) closeMembersDialog();
        }}
      >
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              团队成员 - {selectedTeam?.name}
            </DialogTitle>
            <DialogDescription>
              团队代码: {selectedTeam?.code}
            </DialogDescription>
          </DialogHeader>

          {/* 搜索框和创建按钮 */}
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索成员（用户名、邮箱、全名）"
                value={memberSearchKeyword}
                onChange={(e) => handleMemberSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
            {userStore.user?.is_superuser && (
              <Button onClick={handleCreateMember} size="sm" className="h-9">
                <Plus className="mr-2 h-4 w-4" />
                创建账号
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {membersLoading ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                加载中...
              </div>
            ) : membersList.length > 0 ? (
              <div className="space-y-2">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>用户名</TableHead>
                      <TableHead>邮箱</TableHead>
                      <TableHead>全名</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead>状态</TableHead>
                      {userStore.user?.is_superuser && (
                        <TableHead className="text-right">操作</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {membersList.map((member: TeamMember) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.username}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{member.email}</TableCell>
                        <TableCell>{member.full_name || "-"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {member.is_superuser && (
                              <Badge variant="default">超级管理员</Badge>
                            )}
                            {member.is_team_admin && (
                              <Badge variant="secondary">团队管理员</Badge>
                            )}
                            {!member.is_superuser && !member.is_team_admin && (
                              <Badge variant="outline">成员</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={member.is_active ? "default" : "secondary"}>
                            {member.is_active ? "激活" : "禁用"}
                          </Badge>
                        </TableCell>
                        {userStore.user?.is_superuser && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {!member.is_superuser && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleTeamAdmin(member)}
                                    disabled={settingAdminLoading === member.id || deletingUserId === member.id}
                                    className="h-8"
                                  >
                                    {member.is_team_admin ? (
                                      <>
                                        <ShieldOff className="mr-2 h-4 w-4" />
                                        取消管理员
                                      </>
                                    ) : (
                                      <>
                                        <Shield className="mr-2 h-4 w-4" />
                                        设为管理员
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteMember(member)}
                                    disabled={deletingUserId === member.id}
                                    className="h-8 text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    删除
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={userStore.user?.is_superuser ? 6 : 5}
                      className="h-24 text-center text-sm text-muted-foreground"
                    >
                      该团队暂无成员
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </div>

          {!membersLoading && membersTotal > 0 && (
            <div className="mt-4">
              <Pagination
                currentPage={membersPage}
                totalPages={membersTotalPages}
                totalCount={membersTotal}
                onPageChange={(page) => {
                  setMembersPage(page);
                }}
                disabled={membersLoading}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 设置团队管理员确认对话框 */}
      <AlertDialog
        open={adminConfirmDialogOpen}
        onOpenChange={(open) => {
          setAdminConfirmDialogOpen(open);
          if (!open) {
            setMemberToUpdate(null);
            setError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认操作</AlertDialogTitle>
            <AlertDialogDescription className="text-base space-y-3">
              <div>
                确定要{newAdminStatus ? "设置" : "取消"}用户{" "}
                <span className="font-semibold text-foreground">
                  {memberToUpdate?.username}
                </span>{" "}
                为团队管理员吗？
              </div>
              {newAdminStatus && (
                <div className="rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    设置为团队管理员后，该用户将可以：
                  </p>
                  <ul className="text-xs text-blue-700 dark:text-blue-300 mt-1 list-disc list-inside">
                    <li>管理自己团队内的成员</li>
                    <li>设置权限管理（RBAC）</li>
                    <li>查看和管理自己团队的数据</li>
                  </ul>
                </div>
              )}
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!settingAdminLoading}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmToggleTeamAdmin}
              disabled={!!settingAdminLoading}
              className={newAdminStatus ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              {settingAdminLoading ? "处理中..." : "确认"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除成员确认对话框 */}
      <DeleteConfirmDialog
        open={deleteConfirmDialogOpen}
        onOpenChange={(open) => {
          setDeleteConfirmDialogOpen(open);
          if (!open) {
            setMemberToDelete(null);
            setError("");
          }
        }}
        title="确认删除"
        description={
          <>
            确定要删除用户{" "}
            <span className="font-semibold text-foreground">
              {memberToDelete?.username}
            </span>{" "}
            吗？
          </>
        }
        warningMessage={
          <>
            <p className="text-sm text-destructive">
              ⚠️ 此操作不可恢复！删除用户将同时删除：
            </p>
            <ul className="text-xs text-destructive/80 mt-1 list-disc list-inside">
              <li>用户账户</li>
              <li>用户的所有角色关联</li>
            </ul>
          </>
        }
        error={error}
        onConfirm={handleConfirmDeleteMember}
        loading={!!deletingUserId}
      />

      {/* 创建成员对话框 */}
      <Dialog
        open={createMemberDialogOpen}
        onOpenChange={(open) => {
          setCreateMemberDialogOpen(open);
          if (!open) {
            resetMember();
            setError("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>创建团队成员</DialogTitle>
            <DialogDescription>
              为团队 {selectedTeam?.name} 创建新账号
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitMember(onSubmitCreateMember)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="member-username">用户名 *</Label>
              <Input
                id="member-username"
                placeholder="请输入用户名"
                {...registerMember("username")}
                className={memberErrors.username ? "border-destructive" : ""}
              />
              {memberErrors.username && (
                <p className="text-sm text-destructive">{memberErrors.username.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-email">邮箱 *</Label>
              <Input
                id="member-email"
                type="email"
                placeholder="请输入邮箱"
                {...registerMember("email")}
                className={memberErrors.email ? "border-destructive" : ""}
              />
              {memberErrors.email && (
                <p className="text-sm text-destructive">{memberErrors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-password">密码 *</Label>
              <Input
                id="member-password"
                type="password"
                placeholder="请输入密码（至少6个字符）"
                {...registerMember("password")}
                className={memberErrors.password ? "border-destructive" : ""}
              />
              {memberErrors.password && (
                <p className="text-sm text-destructive">{memberErrors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-fullName">全名（可选）</Label>
              <Input
                id="member-fullName"
                placeholder="请输入全名"
                {...registerMember("fullName")}
                className={memberErrors.fullName ? "border-destructive" : ""}
              />
              {memberErrors.fullName && (
                <p className="text-sm text-destructive">{memberErrors.fullName.message}</p>
              )}
            </div>

            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <p>团队代码: <span className="font-semibold text-foreground">{selectedTeam?.code}</span></p>
              <p className="mt-1 text-xs">新账号将自动加入该团队</p>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateMemberDialogOpen(false)}
                disabled={creatingMember}
              >
                取消
              </Button>
              <Button type="submit" disabled={creatingMember}>
                {creatingMember ? "创建中..." : "创建"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default observer(TeamsClientImpl);
