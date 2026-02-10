"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface TableFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  name: string;
  description: string;
  onCodeChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error?: string;
}

export function TableFormDialog({
  open,
  onOpenChange,
  code,
  name,
  description,
  onCodeChange,
  onNameChange,
  onDescriptionChange,
  onSubmit,
  isSubmitting,
  error,
}: TableFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建表格</DialogTitle>
          <DialogDescription>
            创建一个新的多维表格
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="table-code">
              表格代码 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="table-code"
              value={code}
              onChange={(e) => onCodeChange(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
              placeholder="例如: customer_info"
              disabled={isSubmitting}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              唯一标识，只能包含字母、数字、下划线和连字符
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="table-name">
              表格名称 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="table-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="例如: 客户信息表"
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="table-description">表格描述</Label>
            <Textarea
              id="table-description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="可选，描述表格的用途"
              disabled={isSubmitting}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            取消
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
