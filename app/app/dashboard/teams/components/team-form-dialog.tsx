"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import { FormDialogShell } from "@/components/shared/form-dialog-shell";
import type { Team } from "@/lib/api/teams";
import type { TeamFormData } from "../hooks/use-team-form";
import type { UseFormRegister, FieldErrors, UseFormHandleSubmit } from "react-hook-form";

interface TeamFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTeam: Team | null;
  register: UseFormRegister<TeamFormData>;
  errors: FieldErrors<TeamFormData>;
  isSubmitting: boolean;
  onSubmit: (data: TeamFormData) => void;
  handleSubmit: UseFormHandleSubmit<TeamFormData>;
  error?: string;
  onClose: () => void;
}

export function TeamFormDialog({
  open,
  onOpenChange,
  editingTeam,
  register,
  errors,
  isSubmitting,
  onSubmit,
  handleSubmit,
  error,
  onClose,
}: TeamFormDialogProps) {
  return (
    <FormDialogShell
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) onClose();
      }}
      title={editingTeam ? "编辑团队" : "新建团队"}
      description={
        editingTeam
          ? "修改团队信息（团队代码不可修改）"
          : "创建一个新的团队"
      }
      error={error}
      contentClassName="max-w-md"
      footer={
        <DialogFooter className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="submit" form="team-form-dialog-form" disabled={isSubmitting}>
            {isSubmitting ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      }
    >
      <form
        id="team-form-dialog-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="code">团队代码 *</Label>
          <Input
            id="code"
            placeholder="例如: team001"
            {...register("code")}
            className={errors.code ? "border-destructive" : ""}
            disabled={!!editingTeam}
          />
          {errors.code && (
            <p className="text-sm text-destructive">{errors.code.message}</p>
          )}
          {editingTeam && (
            <p className="text-xs text-muted-foreground">
              团队代码创建后不可修改
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">团队名称 *</Label>
          <Input
            id="name"
            placeholder="请输入团队名称"
            {...register("name")}
            className={errors.name ? "border-destructive" : ""}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>
      </form>
    </FormDialogShell>
  );
}
