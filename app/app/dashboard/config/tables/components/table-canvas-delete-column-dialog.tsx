"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface TableCanvasDeleteColumnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columnToDelete: { key: string; label: string } | null;
  onConfirm: (columnKey: string) => void;
  onCancel: () => void;
}

export function TableCanvasDeleteColumnDialog({
  open,
  onOpenChange,
  columnToDelete,
  onConfirm,
  onCancel,
}: TableCanvasDeleteColumnDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>确认删除列</DialogTitle>
          <DialogDescription>确定要删除列 "{columnToDelete?.label}" 吗？</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (columnToDelete) {
                onConfirm(columnToDelete.key);
                onOpenChange(false);
                onCancel();
              }
            }}
          >
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
