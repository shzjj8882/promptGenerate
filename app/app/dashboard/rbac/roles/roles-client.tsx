"use client";

import { useState, useEffect } from "react";
import { observer } from "mobx-react-lite";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { Role, PermissionsGroupedRawResponse } from "@/lib/api/rbac";
import { cn } from "@/lib/utils";
import { MENU_BUTTON_PERMISSIONS, useHasMenuButtonPermission } from "@/lib/permissions";
import { Pagination } from "@/components/ui/pagination";
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog";
import { usePagination } from "@/hooks/use-pagination";
import { PageHeader } from "@/components/shared/page-header";
import { RoleCard } from "@/components/shared/role-card";
import { useRoles } from "../hooks/use-roles";
import { usePermissions } from "../hooks/use-permissions";
import { useRoleForm } from "../hooks/use-role-form";
import { getGroupLabel, getOrderedResources } from "../utils/rbac-utils";

export type RolesClientProps = {
  initialRoles?: Role[];
  initialRolesTotal?: number;
  initialRolesPage?: number;
  initialPermissionsGroupedRaw?: PermissionsGroupedRawResponse | null;
};

function RolesClientImpl(props: RolesClientProps = {}) {
  const {
    initialRoles,
    initialRolesTotal,
    initialRolesPage,
    initialPermissionsGroupedRaw,
  } = props;

  const canRoleCreate = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.role.create);
  const canRoleUpdate = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.role.update);
  const canRoleDelete = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.role.delete);

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

  const roleForm = useRoleForm({
    rolesPage,
    setRolesPage,
    roles,
    fetchRoles,
    fetchAllRoles: async () => {}, // 角色管理页面不需要刷新全量角色
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

  useEffect(() => {
    const skipRoles =
      initialRoles != null &&
      initialRoles.length > 0 &&
      rolesPage === 1 &&
      rolesActiveFilter === "all";
    if (!skipRoles) {
      fetchRoles(rolesPage);
    }
    if (initialPermissionsGroupedRaw == null) fetchPermissions();
  }, [
    rolesPage,
    rolesActiveFilter,
    fetchRoles,
    fetchPermissions,
    initialRoles,
    initialPermissionsGroupedRaw,
  ]);

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title="角色管理"
        description="管理系统角色，为角色分配菜单权限和接口权限"
        action={
          canRoleCreate ? (
            <Button onClick={handleCreateRole}>
              <Plus className="mr-2 h-4 w-4" />
              新建角色
            </Button>
          ) : undefined
        }
      />

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
        </div>

        {/* 角色列表 - 卡片形式 */}
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

        {/* 分页 */}
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
    </div>
  );
}

export const RolesClient = observer(RolesClientImpl);
