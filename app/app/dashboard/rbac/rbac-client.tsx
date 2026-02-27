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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Pencil, Trash2, Shield, Users, UserCog, ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal, Settings2, UserCheck, Menu } from "lucide-react";
import {
  Permission,
  Role,
  PermissionsGroupedResponse,
  PermissionsGroupedRawResponse,
} from "@/lib/api/rbac";
import { getUserRoles, assignRolesToUser, User } from "@/lib/api/users";
import { cn } from "@/lib/utils";
import { MENU_BUTTON_PERMISSIONS, useHasMenuButtonPermission } from "@/lib/permissions";
import { showSuccessToast, showErrorToast } from "@/lib/utils/toast";
import { getDisplayMessage } from "@/lib/utils/error";
import { Pagination } from "@/components/ui/pagination";
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog";
import { SortIcon } from "@/components/shared/sort-icon";
import { usePagination } from "@/hooks/use-pagination";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { TableState } from "@/components/shared/table-state";
import { ActionButtons } from "@/components/shared/action-buttons";
import { TableSkeleton } from "@/components/shared/table-skeleton";
import { RoleCard } from "@/components/shared/role-card";
import { logger } from "@/lib/utils/logger";
import { useRoles } from "./hooks/use-roles";
import { usePermissions } from "./hooks/use-permissions";
import { useUsers } from "./hooks/use-users";
import { useRoleForm } from "./hooks/use-role-form";
import { getGroupLabel, getOrderedResources } from "./utils/rbac-utils";
import { MenuManagementClient } from "./menu-management-client";

/** 服务端首屏传入的初始数据，有则用于初始化并跳过首屏重复请求 */
export type RBACClientProps = {
  initialRoles?: Role[];
  initialRolesTotal?: number;
  initialRolesPage?: number;
  initialPermissionsGroupedRaw?: PermissionsGroupedRawResponse | null;
  initialUsers?: User[];
  initialUsersTotal?: number;
  initialUsersPage?: number;
  initialUserRoleIdsMap?: Record<string, string[]>;
  /** 用户 tab 分配角色用到的全量角色，有则首屏不调 loadAllRoles */
  initialAllRoles?: Role[];
};

function RBACClientImpl(props: RBACClientProps = {}) {
  const {
    initialRoles,
    initialRolesTotal,
    initialRolesPage,
    initialPermissionsGroupedRaw,
    initialUsers,
    initialUsersTotal,
    initialUsersPage,
    initialUserRoleIdsMap,
    initialAllRoles,
  } = props;

  const canRoleCreate = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.role.create);
  const canRoleUpdate = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.role.update);
  const canRoleDelete = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.role.delete);
  const canUserRoleAssign = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.userRole.assign);

  // 标签页状态
  const [activeTab, setActiveTab] = useState<"roles" | "user-roles" | "menu-management">("roles");
  const [selectedActions, setSelectedActions] = useState<string[]>([]);

  // ==================== 角色管理状态（可由服务端 initial 初始化） ====================
  const {
    currentPage: rolesPage,
    setCurrentPage: setRolesPage,
    totalCount: rolesTotal,
    setTotalCount: setRolesTotal,
    totalPages: rolesTotalPages,
  } = usePagination({
    initialPage: initialRolesPage ?? 1,
    initialTotal: initialRolesTotal ?? 0,
  });
  const [rolesActiveFilter, setRolesActiveFilter] = useState<string>("all");
  const {
    roles,
    loading: rolesLoading,
    fetchRoles,
  } = useRoles({
    initialRoles,
    initialTotal: initialRolesTotal ?? 0,
    onTotalChange: setRolesTotal,
    activeFilter: rolesActiveFilter,
  });
  const {
    permissionsGroupedForRole,
    fetchPermissions,
  } = usePermissions({ initialPermissionsGroupedRaw });

  // 用户分页 + 用户/全量角色数据（fetchAllRoles 供角色创建/编辑/删除后刷新用）
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

  const roleForm = useRoleForm({
    rolesPage,
    setRolesPage,
    roles,
    fetchRoles,
    fetchAllRoles,
  });
  const {
    registerRole,
    handleSubmitRole,
    roleErrors,
    isRoleSubmitting,
    roleError,
    isRoleDialogOpen,
    setIsRoleDialogOpen,
    editingRole,
    rolePermissionTab,
    setRolePermissionTab,
    selectedPermissionIds,
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
  } = roleForm;

  // ==================== 角色列表加载 ====================

  useEffect(() => {
    if (activeTab === "roles") {
      const skipRoles =
        initialRoles != null &&
        initialRoles.length > 0 &&
        rolesPage === 1 &&
        rolesActiveFilter === "all";
      if (!skipRoles) {
        fetchRoles(rolesPage);
      }
      if (initialPermissionsGroupedRaw == null) fetchPermissions();
    }
  }, [
    rolesPage,
    rolesActiveFilter,
    activeTab,
    fetchRoles,
    fetchPermissions,
    initialRoles,
    initialPermissionsGroupedRaw,
  ]);

  // ==================== 用户角色分配 UI 状态 ====================
  const [isUserRoleDialogOpen, setIsUserRoleDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userSelectedRoleIds, setUserSelectedRoleIds] = useState<string[]>([]);

  // 表格状态（与租户管理保持一致）
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  useEffect(() => {
    if (activeTab === "user-roles") {
      const skipUsers =
        initialUsers != null &&
        initialUsers.length > 0 &&
        usersPage === 1 &&
        usersActiveFilter === "all";
      if (!skipUsers) fetchUsers(usersPage);
      if (!initialAllRoles || initialAllRoles.length === 0) {
        fetchAllRoles();
      }
    }
  }, [
    usersPage,
    usersActiveFilter,
    activeTab,
    fetchUsers,
    fetchAllRoles,
    initialUsers,
    initialAllRoles,
  ]);

  // 使用公共排序图标组件
  const renderSortIcon = useCallback((sorted: false | "asc" | "desc") => {
    return <SortIcon sorted={sorted} />;
  }, []);

  // 用户表格列定义（使用 @tanstack/react-table）
  const userColumns = useMemo<ColumnDef<User>[]>(
    () => [
      // 用于全局搜索（用户名/邮箱/全名），隐藏不展示
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
    [userRoleIdsMap, allRolesForUser, canUserRoleAssign]
  );

  // 可切换显示的列
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

  // 用户表格实例
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

  // 打开用户角色分配对话框，并预选用户当前角色
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

  // 提交用户角色分配
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

  // 切换用户角色选择
  const toggleUserRoleSelection = useCallback((roleId: string) => {
    setUserSelectedRoleIds((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId]
    );
  }, []);


  return (
    <div className="flex h-full flex-col gap-6">


      {/* 标签页切换 */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("roles")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "roles"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="inline mr-2 h-4 w-4" />
          角色管理
        </button>
        <button
          onClick={() => setActiveTab("user-roles")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "user-roles"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <UserCog className="inline mr-2 h-4 w-4" />
          用户角色分配
        </button>
        <button
          onClick={() => setActiveTab("menu-management")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "menu-management"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Menu className="inline mr-2 h-4 w-4" />
          菜单管理
        </button>
      </div>

      {/* 角色管理标签页 */}
      {activeTab === "roles" && (
        <div className="flex flex-1 min-h-0 flex-col gap-4">
          {/* 操作栏 */}
          <div className="flex items-center justify-between shrink-0">
            <Select
              value={rolesActiveFilter}
              onValueChange={(value) => {
                setRolesActiveFilter(value);
                setRolesPage(1);
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
            {canRoleCreate && (
              <Button onClick={handleCreateRole}>
                <Plus className="mr-2 h-4 w-4" />
                新建角色
              </Button>
            )}
          </div>

          {/* 角色列表 - 卡片形式（可滚动区域，占据剩余高度） */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {rolesLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
            ) : roles.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                暂无角色数据
              </div>
            ) : (
              <div className="flex flex-wrap gap-4 sm:gap-6">
                {roles.map((role) => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    onEdit={handleEditRole}
                    onDelete={handleDeleteRoleClick}
                    onToggleActive={handleRoleActiveToggle}
                    isToggling={roleTogglingId === role.id}
                    canEdit={canRoleUpdate}
                    canDelete={canRoleDelete}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 分页：固定在底部 */}
          {!rolesLoading && roles.length > 0 && (
            <Pagination
              currentPage={rolesPage}
              totalPages={rolesTotalPages}
              totalCount={rolesTotal}
              onPageChange={setRolesPage}
              disabled={rolesLoading}
            />
          )}

          {/* 创建/编辑角色对话框 */}
          <Dialog
            open={isRoleDialogOpen}
            onOpenChange={(open) => {
              setIsRoleDialogOpen(open);
              if (!open) closeRoleDialog();
            }}
          >
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
              <DialogHeader className="shrink-0 px-6 pt-6 pb-4 pr-12 border-b">
                <DialogTitle>
                  {editingRole ? "编辑角色" : "新建角色"}
                </DialogTitle>
                <DialogDescription>
                  {editingRole ? "修改角色信息" : "创建一个新的角色"}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmitRole(onSubmitRole)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 custom-scrollbar space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="role-name">角色名称 *</Label>
                  <Input
                    id="role-name"
                    placeholder="例如: 管理员"
                    {...registerRole("name")}
                    className={roleErrors.name ? "border-destructive" : ""}
                  />
                  {roleErrors.name && (
                    <p className="text-sm text-destructive">
                      {roleErrors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role-code">角色代码 *</Label>
                  <Input
                    id="role-code"
                    placeholder="例如: admin"
                    {...registerRole("code")}
                    className={roleErrors.code ? "border-destructive" : ""}
                    disabled={!!editingRole}
                  />
                  {roleErrors.code && (
                    <p className="text-sm text-destructive">
                      {roleErrors.code.message}
                    </p>
                  )}
                </div>

                <div className="space-y-4 block">
                  <Label className="text-base font-medium block">权限分配</Label>
                  {/* Tab：菜单权限 / 接口权限 */}
                  <div className="flex gap-4 border-b border-border text-sm font-medium">
                    <button
                      type="button"
                      onClick={() => setRolePermissionTab("menu")}
                      className={cn(
                        "pb-2 transition-colors",
                        rolePermissionTab === "menu"
                          ? "border-b-2 border-primary text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      菜单权限
                    </button>
                    <button
                      type="button"
                      onClick={() => setRolePermissionTab("api")}
                      className={cn(
                        "pb-2 transition-colors",
                        rolePermissionTab === "api"
                          ? "border-b-2 border-primary text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      接口权限
                    </button>
                  </div>
                  <div className="bg-muted/20 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {!permissionsGroupedForRole ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">加载中...</p>
                    ) : rolePermissionTab === "menu" ? (
                      (() => {
                        const routeKeys = Object.keys(permissionsGroupedForRole.menu?.route ?? {});
                        const buttonKeys = Object.keys(permissionsGroupedForRole.menu?.button ?? {});
                        const allMenuResources = getOrderedResources(
                          [...new Set([...routeKeys, ...buttonKeys])],
                          permissionsGroupedForRole.resource_order
                        );
                        if (allMenuResources.length === 0) {
                          return (
                            <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                              无菜单权限
                            </p>
                          );
                        }
                        return (
                          <div className="space-y-4">
                            {allMenuResources
                              .filter((resource) => {
                                const routePerms = permissionsGroupedForRole.menu?.route?.[resource] ?? [];
                                const buttonPerms = permissionsGroupedForRole.menu?.button?.[resource] ?? [];
                                // 如果既没有路由权限也没有按钮权限，则不显示这个资源
                                return routePerms.length > 0 || buttonPerms.length > 0;
                              })
                              .map((resource) => {
                              const routePerms = permissionsGroupedForRole.menu?.route?.[resource] ?? [];
                              const buttonPerms = permissionsGroupedForRole.menu?.button?.[resource] ?? [];
                              const cardPermIds = [...routePerms, ...buttonPerms].map((p) => p.id);
                              const cardAllSelected = cardPermIds.length > 0 && cardPermIds.every((id) => selectedPermissionIds.includes(id));
                              const cardSomeSelected = cardPermIds.length > 0 && cardPermIds.some((id) => selectedPermissionIds.includes(id)) && !cardAllSelected;
                              return (
                                <Card key={`rm-module-${resource}`} className="py-3">
                                  <CardHeader className="pb-2 pt-0">
                                    <div className="flex items-center gap-2">
                                      {cardPermIds.length > 0 && (
                                        <Checkbox
                                          checked={cardAllSelected}
                                          onCheckedChange={() => toggleCardPermissionSelection(cardPermIds)}
                                          aria-label="全选"
                                          className={cardSomeSelected ? "data-[state=checked]:bg-black/50" : ""}
                                        />
                                      )}
                                      <CardTitle className="text-sm font-medium text-foreground">
                                        {getGroupLabel(resource, permissionsGroupedForRole.resource_labels ?? {})}
                                      </CardTitle>
                                    </div>
                                  </CardHeader>
                                  <CardContent className="space-y-4 pt-0">
                                    {/* 该模块下的路由权限 */}
                                    {routePerms.length > 0 && (
                                      <div className="space-y-2">
                                        <div className="text-xs font-medium text-muted-foreground">路由权限</div>
                                        <div className="space-y-1">
                                          {routePerms.map((p) => (
                                            <label
                                              key={p.id}
                                              htmlFor={`perm-menu-route-${p.id}`}
                                              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                                            >
                                              <Checkbox
                                                id={`perm-menu-route-${p.id}`}
                                                checked={selectedPermissionIds.includes(p.id)}
                                                onCheckedChange={() => togglePermissionSelection(p.id)}
                                              />
                                              <span className="text-sm">{p.name}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {/* 该模块下的按钮权限 */}
                                    {buttonPerms.length > 0 && (
                                      <div className="space-y-2">
                                        <div className="text-xs font-medium text-muted-foreground">按钮权限</div>
                                        <div className="space-y-1">
                                          {buttonPerms.map((p) => (
                                            <label
                                              key={p.id}
                                              htmlFor={`perm-menu-button-${p.id}`}
                                              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                                            >
                                              <Checkbox
                                                id={`perm-menu-button-${p.id}`}
                                                checked={selectedPermissionIds.includes(p.id)}
                                                onCheckedChange={() => togglePermissionSelection(p.id)}
                                              />
                                              <span className="text-sm">{p.name}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="space-y-4">
                        {Object.keys(permissionsGroupedForRole.api ?? {}).length === 0 ? (
                          <p className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">无接口权限</p>
                        ) : (
                          getOrderedResources(Object.keys(permissionsGroupedForRole.api), permissionsGroupedForRole.resource_order)
                            .filter((resource) => {
                              const apiPerms = permissionsGroupedForRole.api?.[resource] ?? [];
                              // 如果没有接口权限，则不显示这个资源
                              return apiPerms.length > 0;
                            })
                            .map((resource) => {
                            const apiPerms = permissionsGroupedForRole.api?.[resource] ?? [];
                            const apiPermIds = apiPerms.map((p) => p.id);
                            const apiAllSelected = apiPermIds.length > 0 && apiPermIds.every((id) => selectedPermissionIds.includes(id));
                            const apiSomeSelected = apiPermIds.length > 0 && apiPermIds.some((id) => selectedPermissionIds.includes(id)) && !apiAllSelected;
                            return (
                            <Card key={`ra-${resource}`} className="py-3">
                              <CardHeader className="pb-2 pt-0">
                                <div className="flex items-center gap-2">
                                  {apiPermIds.length > 0 && (
                                    <Checkbox
                                      checked={apiAllSelected}
                                      onCheckedChange={() => toggleCardPermissionSelection(apiPermIds)}
                                      aria-label="全选"
                                      className={apiSomeSelected ? "data-[state=checked]:bg-black/50" : ""}
                                    />
                                  )}
                                  <CardTitle className="text-sm font-medium text-muted-foreground">
                                    {getGroupLabel(resource, permissionsGroupedForRole.resource_labels ?? {})}
                                  </CardTitle>
                                </div>
                              </CardHeader>
                              <CardContent className="pt-0">
                                <div className="grid grid-cols-1 gap-2">
                                  {apiPerms.map((p) => (
                                    <label
                                      key={p.id}
                                      htmlFor={`perm-api-${p.id}`}
                                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                                    >
                                      <Checkbox
                                        id={`perm-api-${p.id}`}
                                        checked={selectedPermissionIds.includes(p.id)}
                                        onCheckedChange={() => togglePermissionSelection(p.id)}
                                      />
                                      <span className="text-sm">{p.name}</span>
                                    </label>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                            );
                            })
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {roleError && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {roleError}
                  </div>
                )}
              </div>
              <div className="shrink-0 px-6 py-4 border-t flex flex-row items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsRoleDialogOpen(false)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={isRoleSubmitting}>
                  {isRoleSubmitting ? "保存中..." : "保存"}
                </Button>
              </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* 删除角色确认对话框 */}
          <DeleteConfirmDialog
            open={deleteRoleDialogOpen}
            onOpenChange={(open) => {
              setDeleteRoleDialogOpen(open);
              if (!open) {
                setRoleToDelete(null);
              }
            }}
            title="确认删除"
            description={`确定要删除角色 ${roleToDelete?.name || ""} 吗？`}
            onConfirm={handleConfirmDeleteRole}
            loading={deleteRoleLoading}
          />
        </div>
      )}

      {/* 菜单管理标签页 */}
      {activeTab === "menu-management" && (
        <div className="flex flex-1 min-h-0 flex-col">
          <MenuManagementClient />
        </div>
      )}

      {/* 用户角色分配标签页 */}
      {activeTab === "user-roles" && (
        <div className="flex flex-1 min-h-0 flex-col gap-4">
          {/* 顶部工具栏（搜索、列显示、筛选） */}
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
      )}
    </div>
  );
}

const RBACClient = observer(RBACClientImpl);
export default RBACClient;
