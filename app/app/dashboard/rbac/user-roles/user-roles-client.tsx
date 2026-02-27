"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MemoizedTableRow } from "@/components/shared/memoized-table-row";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserCog, Settings2 } from "lucide-react";
import { Role } from "@/lib/api/rbac";
import { getUserRoles, assignRolesToUser, User } from "@/lib/api/users";
import { MENU_BUTTON_PERMISSIONS, useHasMenuButtonPermission } from "@/lib/permissions";
import { showSuccessToast } from "@/lib/utils/toast";
import { getDisplayMessage } from "@/lib/utils/error";
import { Pagination } from "@/components/ui/pagination";
import { SortIcon } from "@/components/shared/sort-icon";
import { usePagination } from "@/hooks/use-pagination";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { TableState } from "@/components/shared/table-state";
import { ActionButtons } from "@/components/shared/action-buttons";
import { TableSkeleton } from "@/components/shared/table-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { logger } from "@/lib/utils/logger";
import { useUsers } from "../hooks/use-users";

export type UserRolesClientProps = {
  initialUsers?: User[];
  initialUsersTotal?: number;
  initialUsersPage?: number;
  initialUserRoleIdsMap?: Record<string, string[]>;
  initialAllRoles?: Role[];
};

function UserRolesClientImpl(props: UserRolesClientProps = {}) {
  const {
    initialUsers,
    initialUsersTotal,
    initialUsersPage,
    initialUserRoleIdsMap,
    initialAllRoles,
  } = props;

  const canUserRoleAssign = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.userRole.assign);

  const {
    currentPage: usersPage,
    setCurrentPage: setUsersPage,
    totalCount: usersTotal,
    setTotalCount: setUsersTotal,
    totalPages: usersTotalPages,
  } = usePagination({
    initialPage: initialUsersPage ?? 1,
    initialTotal: initialUsersTotal ?? 0,
  });
  const [usersActiveFilter, setUsersActiveFilter] = useState<string>("all");
  const [userRoleError, setUserRoleError] = useState<string>("");
  const { handleError: handleUserRoleError } = useErrorHandler({
    setError: setUserRoleError,
    showToast: false,
  });
  const {
    users,
    usersLoading,
    userRoleIdsMap,
    allRolesForUser,
    fetchUsers,
    fetchAllRoles,
  } = useUsers({
    initialUsers,
    initialUserRoleIdsMap,
    initialAllRoles,
    usersActiveFilter,
    setUsersTotal,
    setUserRoleError,
  });

  const [isUserRoleDialogOpen, setIsUserRoleDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userSelectedRoleIds, setUserSelectedRoleIds] = useState<string[]>([]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  useEffect(() => {
    const skipUsers =
      initialUsers != null &&
      initialUsers.length > 0 &&
      usersPage === 1 &&
      usersActiveFilter === "all";
    if (!skipUsers) fetchUsers(usersPage);
    if (!initialAllRoles || initialAllRoles.length === 0) {
      fetchAllRoles();
    }
  }, [
    usersPage,
    usersActiveFilter,
    fetchUsers,
    fetchAllRoles,
    initialUsers,
    initialAllRoles,
  ]);

  const renderSortIcon = useCallback((sorted: false | "asc" | "desc") => {
    return <SortIcon sorted={sorted} />;
  }, []);

  const userColumns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        id: "search",
        accessorFn: (row) => `${row.username} ${row.email} ${row.full_name || ""}`,
        enableSorting: false,
        enableHiding: false,
        filterFn: "includesString",
        header: () => null,
        cell: () => null,
      },
      {
        accessorKey: "username",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            用户名
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="font-medium">{row.original.username}</div>
        ),
      },
      {
        accessorKey: "email",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            邮箱
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-sm">{row.original.email}</div>
        ),
      },
      {
        accessorKey: "full_name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            全名
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {row.original.full_name || "-"}
          </div>
        ),
      },
      {
        id: "roles",
        header: "已分配角色",
        cell: ({ row }) => {
          const user = row.original;
          const roleIds = userRoleIdsMap[user.id] ?? [];
          const roleNames = roleIds
            .map((id) => allRolesForUser.find((r) => r.id === id)?.name)
            .filter(Boolean) as string[];
          return (
            <div className="flex flex-wrap gap-1">
              {roleNames.length > 0 ? (
                roleNames.slice(0, 3).map((name) => (
                  <Badge key={name} variant="outline" className="text-xs">
                    {name}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">无</span>
              )}
              {roleNames.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{roleNames.length - 3}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "is_active",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            状态
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? "default" : "secondary"}>
            {row.original.is_active ? "已激活" : "未激活"}
          </Badge>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">操作</div>,
        cell: ({ row }) => {
          const user = row.original;
          return (
            <ActionButtons
              variant="dropdown"
              canEdit={false}
              canDelete={false}
              additionalActions={
                canUserRoleAssign
                  ? [
                      {
                        label: "分配角色",
                        icon: <UserCog className="h-4 w-4" />,
                        onClick: () => handleAssignUserRoles(user),
                      },
                    ]
                  : []
              }
            />
          );
        },
      },
    ],
    [userRoleIdsMap, allRolesForUser, canUserRoleAssign, renderSortIcon]
  );

  const userColumnsToggleable = useMemo(
    () => [
      { id: "username", label: "用户名" },
      { id: "email", label: "邮箱" },
      { id: "full_name", label: "全名" },
      { id: "roles", label: "已分配角色" },
      { id: "is_active", label: "状态" },
    ],
    []
  );

  const userTable = useReactTable({
    data: users,
    columns: userColumns,
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

  const handleAssignUserRoles = useCallback(async (user: User) => {
    try {
      setEditingUser(user);
      setUserRoleError("");
      const roleIds = await getUserRoles(user.id);
      setUserSelectedRoleIds(roleIds);
      setIsUserRoleDialogOpen(true);
    } catch (err) {
      logger.error("获取用户角色失败", err);
      setUserRoleError(getDisplayMessage(err, "获取用户角色失败"));
      setUserSelectedRoleIds([]);
      setIsUserRoleDialogOpen(true);
    }
  }, []);

  const handleSubmitUserRoles = useCallback(
    async () => {
      if (!editingUser) return;
      setUserRoleError("");
      try {
        await assignRolesToUser(editingUser.id, userSelectedRoleIds);
        showSuccessToast("角色分配已保存");
        setIsUserRoleDialogOpen(false);
        await fetchUsers(usersPage);
      } catch (err) {
        handleUserRoleError(err, "分配角色失败，请稍后重试");
      }
    },
    [editingUser, userSelectedRoleIds, usersPage, fetchUsers, handleUserRoleError]
  );

  const toggleUserRoleSelection = useCallback((roleId: string) => {
    setUserSelectedRoleIds((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId]
    );
  }, []);

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title="用户权限分配"
        description="为用户分配角色，角色决定了用户拥有的菜单权限和接口权限"
      />

      <div className="flex flex-1 min-h-0 flex-col gap-4">
        {/* 顶部工具栏 */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <Input
              placeholder="搜索用户（用户名 / 邮箱 / 全名）..."
              value={(userTable.getColumn("search")?.getFilterValue() as string) ?? ""}
              onChange={(event) => userTable.getColumn("search")?.setFilterValue(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Select
              value={usersActiveFilter}
              onValueChange={(value) => {
                setUsersActiveFilter(value);
                setUsersPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="筛选状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="true">已激活</SelectItem>
                <SelectItem value="false">未激活</SelectItem>
              </SelectContent>
            </Select>
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
                {userColumnsToggleable.map((c) => {
                  const col = userTable.getColumn(c.id);
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
          </div>
        </div>

        {/* 用户列表 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="overflow-hidden rounded-md border bg-background">
            <Table>
              <TableHeader>
                {userTable.getHeaderGroups().map((headerGroup) => (
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
                {usersLoading ? (
                  <TableSkeleton rows={5} cols={7} />
                ) : (
                  <>
                    <TableState
                      loading={false}
                      empty={!userTable.getRowModel().rows?.length}
                      colSpan={7}
                      emptyText="暂无用户数据"
                    />
                    {userTable.getRowModel().rows?.length > 0 &&
                      userTable.getRowModel().rows.map((row) => (
                        <MemoizedTableRow key={row.id} row={row} />
                      ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {!usersLoading && users.length > 0 && (
          <Pagination
            currentPage={usersPage}
            totalPages={usersTotalPages}
            totalCount={usersTotal}
            onPageChange={setUsersPage}
            disabled={usersLoading}
          />
        )}

        {/* 用户角色分配对话框 */}
        <Dialog
          open={isUserRoleDialogOpen}
          onOpenChange={(open) => {
            setIsUserRoleDialogOpen(open);
            if (!open) {
              setUserRoleError("");
              setEditingUser(null);
              setUserSelectedRoleIds([]);
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
            <DialogHeader className="shrink-0 px-6 pt-6 pb-4 pr-12 border-b">
              <DialogTitle>为用户分配角色</DialogTitle>
              <DialogDescription>
                为用户 <span className="font-semibold">{editingUser?.username}</span> 分配角色
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 custom-scrollbar">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>用户信息</Label>
                <div className="rounded-md border p-3 bg-muted/50">
                  <div className="text-sm">
                    <div className="font-medium">{editingUser?.username}</div>
                    <div className="text-muted-foreground">{editingUser?.email}</div>
                    {editingUser?.full_name && (
                      <div className="text-muted-foreground">{editingUser.full_name}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>角色分配</Label>
                <div className="border rounded-md p-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {allRolesForUser.length === 0 ? (
                    <p className="text-sm text-muted-foreground">暂无角色数据</p>
                  ) : (
                    <div className="space-y-2">
                      {allRolesForUser.map((role) => (
                        <div
                          key={role.id}
                          className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded"
                        >
                          <Checkbox
                            id={`user-role-${role.id}`}
                            checked={userSelectedRoleIds.includes(role.id)}
                            onCheckedChange={() => toggleUserRoleSelection(role.id)}
                          />
                          <Label
                            htmlFor={`user-role-${role.id}`}
                            className="flex-1 text-sm font-normal cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs">{role.code}</span>
                              <span className="text-muted-foreground">-</span>
                              <span>{role.name}</span>
                              {!role.is_active && (
                                <Badge variant="secondary" className="text-xs">
                                  未激活
                                </Badge>
                              )}
                            </div>
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {userRoleError && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {userRoleError}
                </div>
              )}
            </div>
            </div>
            <div className="shrink-0 px-6 py-4 border-t flex flex-row items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsUserRoleDialogOpen(false)}
              >
                取消
              </Button>
              <Button onClick={handleSubmitUserRoles}>
                保存
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export const UserRolesClient = observer(UserRolesClientImpl);
