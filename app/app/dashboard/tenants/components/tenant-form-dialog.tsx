"use client";

import { memo } from "react";
import type {
  UseFormRegister,
  UseFormHandleSubmit,
  FieldErrors,
  SubmitHandler,
} from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Tenant } from "@/lib/api/tenants";
import type { TenantFormData } from "../hooks/use-tenant-form";

interface TenantFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTenant: Tenant | null;
  error: string;
  register: UseFormRegister<TenantFormData>;
  handleSubmit: UseFormHandleSubmit<TenantFormData>;
  errors: FieldErrors<TenantFormData>;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: SubmitHandler<TenantFormData>;
  reset: () => void;
}

/**
 * 租户创建/编辑表单对话框组件
 */
export const TenantFormDialog = memo(function TenantFormDialog({
  open,
  onOpenChange,
  editingTenant,
  error,
  register,
  handleSubmit,
  errors,
  isSubmitting,
  onClose,
  onSubmit,
  reset,
}: TenantFormDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          reset();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingTenant ? "编辑租户" : "新建租户"}
          </DialogTitle>
          <DialogDescription>
            {editingTenant
              ? "修改租户信息"
              : "创建一个新的租户"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code_id">租户编号 *</Label>
            <Input
              id="code_id"
              placeholder="例如: tenant-001"
              {...register("code_id")}
              className={errors.code_id ? "border-destructive" : ""}
              disabled={!!editingTenant} // 编辑时不允许修改编号
            />
            {errors.code_id && (
              <p className="text-sm text-destructive">
                {errors.code_id.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">租户名称 *</Label>
            <Input
              id="name"
              placeholder="请输入租户名称"
              {...register("name")}
              className={errors.name ? "border-destructive" : ""}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="app_id">应用ID</Label>
            <Input
              id="app_id"
              type="text"
              placeholder="请输入应用ID（可选）"
              {...register("app_id")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="app_secret">应用密钥</Label>
            <PasswordInput
              id="app_secret"
              placeholder="请输入应用密钥（可选）"
              {...register("app_secret")}
            />
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
              onClick={onClose}
            >
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "保存中..." : "保存"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
});
