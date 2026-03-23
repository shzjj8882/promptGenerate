"use client";

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
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Shield, ShieldOff, Trash2 } from "@/components/icons";
import { PasswordInput } from "@/components/ui/password-input";
import { Pagination } from "@/components/ui/pagination";
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog";
import { userStore } from "@/store/user-store";
import type { Team, TeamMember } from "@/lib/api/teams";
import type { MemberFormData } from "../hooks/use-team-members";

export interface TeamMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTeam: Team | null;
  members: TeamMember[];
  membersLoading: boolean;
  membersPage: number;
  membersTotal: number;
  membersTotalPages: number;
  memberSearchKeyword: string;
  onMemberSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onCreateMember: () => void;
  onClose: () => void;
  /** 管理员切换 */
  settingAdminLoading: string | null;
  adminConfirmDialogOpen: boolean;
  setAdminConfirmDialogOpen: (open: boolean) => void;
  memberToUpdate: TeamMember | null;
  newAdminStatus: boolean;
  onToggleTeamAdmin: (member: TeamMember) => void;
  onConfirmToggleTeamAdmin: () => void;
  /** 删除成员 */
  deleteConfirmDialogOpen: boolean;
  setDeleteConfirmDialogOpen: (open: boolean) => void;
  memberToDelete: TeamMember | null;
  deletingUserId: string | null;
  onDeleteMember: (member: TeamMember) => void;
  onConfirmDeleteMember: () => void;
  onAdminConfirmClose?: () => void;
  onDeleteConfirmClose?: () => void;
  /** 创建成员 */
  createMemberDialogOpen: boolean;
  setCreateMemberDialogOpen: (open: boolean) => void;
  creatingMember: boolean;
  registerMember: (name: keyof MemberFormData) => object;
  handleSubmitMember: (onValid: (data: MemberFormData) => void | Promise<void>) => (e?: React.BaseSyntheticEvent) => Promise<void>;
  memberErrors: Partial<Record<keyof MemberFormData, { message?: string }>>;
  onResetMember: () => void;
  onSubmitCreateMember: (data: MemberFormData) => void | Promise<void>;
  error: string;
}

/**
 * 团队成员管理对话框
 * 包含：成员列表、搜索、分页、设置管理员、删除、创建成员
 */
export function TeamMembersDialog({
  open,
  onOpenChange,
  selectedTeam,
  members,
  membersLoading,
  membersPage,
  membersTotal,
  membersTotalPages,
  memberSearchKeyword,
  onMemberSearchChange,
  onPageChange,
  onCreateMember,
  onClose,
  settingAdminLoading,
  adminConfirmDialogOpen,
  setAdminConfirmDialogOpen,
  memberToUpdate,
  newAdminStatus,
  onToggleTeamAdmin,
  onConfirmToggleTeamAdmin,
  deleteConfirmDialogOpen,
  setDeleteConfirmDialogOpen,
  memberToDelete,
  deletingUserId,
  onDeleteMember,
  onConfirmDeleteMember,
  onAdminConfirmClose,
  onDeleteConfirmClose,
  createMemberDialogOpen,
  setCreateMemberDialogOpen,
  creatingMember,
  registerMember,
  handleSubmitMember,
  memberErrors,
  onResetMember,
  onSubmitCreateMember,
  error,
}: TeamMembersDialogProps) {
  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>团队成员 - {selectedTeam?.name}</DialogTitle>
            <DialogDescription>团队代码: {selectedTeam?.code}</DialogDescription>
          </DialogHeader>

          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索成员（用户名、邮箱、全名）"
                value={memberSearchKeyword}
                onChange={(e) => onMemberSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
            {userStore.user?.is_superuser && (
              <Button onClick={onCreateMember} size="sm" className="h-9">
                <Plus className="mr-2 h-4 w-4" />
                创建账号
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {membersLoading ? (
              <div className="text-center py-8 text-sm text-muted-foreground">加载中...</div>
            ) : members.length > 0 ? (
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
                    {members.map((member) => (
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
                                    onClick={() => onToggleTeamAdmin(member)}
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
                                    onClick={() => onDeleteMember(member)}
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
                onPageChange={onPageChange}
                disabled={membersLoading}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={adminConfirmDialogOpen}
        onOpenChange={(open) => {
          setAdminConfirmDialogOpen(open);
          if (!open) onAdminConfirmClose?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认操作</AlertDialogTitle>
            <AlertDialogDescription className="text-base space-y-3">
              <div>
                确定要{newAdminStatus ? "设置" : "取消"}用户{" "}
                <span className="font-semibold text-foreground">{memberToUpdate?.username}</span>{" "}
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
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!settingAdminLoading}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmToggleTeamAdmin}
              disabled={!!settingAdminLoading}
              className={newAdminStatus ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              {settingAdminLoading ? "处理中..." : "确认"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteConfirmDialog
        open={deleteConfirmDialogOpen}
        onOpenChange={(open) => {
          setDeleteConfirmDialogOpen(open);
          if (!open) onDeleteConfirmClose?.();
        }}
        title="确认删除"
        description={
          <>
            确定要删除用户{" "}
            <span className="font-semibold text-foreground">{memberToDelete?.username}</span> 吗？
          </>
        }
        warningMessage={
          <>
            <p className="text-sm text-destructive">⚠️ 此操作不可恢复！删除用户将同时删除：</p>
            <ul className="text-xs text-destructive/80 mt-1 list-disc list-inside">
              <li>用户账户</li>
              <li>用户的所有角色关联</li>
            </ul>
          </>
        }
        error={error}
        onConfirm={onConfirmDeleteMember}
        loading={!!deletingUserId}
      />

      <Dialog
        open={createMemberDialogOpen}
        onOpenChange={(open) => {
          setCreateMemberDialogOpen(open);
          if (!open) {
            onResetMember();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>创建团队成员</DialogTitle>
            <DialogDescription>为团队 {selectedTeam?.name} 创建新账号</DialogDescription>
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
              <PasswordInput
                id="member-password"
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
              <p>
                团队代码: <span className="font-semibold text-foreground">{selectedTeam?.code}</span>
              </p>
              <p className="mt-1 text-xs">新账号将自动加入该团队</p>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
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
    </>
  );
}
