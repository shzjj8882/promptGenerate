"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TableColumnFormField } from "@/components/shared/table-column-form-field";
import { Copy, Check } from "@/components/icons";
import { buildCurlCommandForApi, getCurlBaseUrl } from "@/lib/utils/curl";
import type { MultiDimensionTable, TableRow as TableRowType, TableColumn } from "@/lib/api/multi-dimension-tables";
import { userStore } from "@/store/user-store";

export type RowRecordDialogMode = "add" | "edit" | "delete";

interface RowRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: RowRecordDialogMode;
  table: MultiDimensionTable;
  row?: TableRowType;
  onSubmit: (mode: RowRecordDialogMode, cells?: Record<string, string>) => void | Promise<void>;
}

export function RowRecordDialog({
  open,
  onOpenChange,
  mode,
  table,
  row,
  onSubmit,
}: RowRecordDialogProps) {
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const columns = table?.columns || [];

  useEffect(() => {
    if (!open) return;
    if (mode === "add") {
      const initial: Record<string, string> = {};
      columns.forEach((col) => {
        initial[col.key] = col.options?.defaultValue || "";
      });
      setFormValues(initial);
    } else if (mode === "edit" && row?.cells) {
      setFormValues({ ...row.cells });
    }
  }, [open, mode, row, columns]);

  const handleSubmit = useCallback(async () => {
    if (mode === "delete") {
      setSubmitting(true);
      try {
        await onSubmit("delete");
        onOpenChange(false);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(mode, formValues);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }, [mode, formValues, onSubmit, onOpenChange]);

  const handleCopyCurl = useCallback(async () => {
    if (!table?.code) return;

    const baseUrl = getCurlBaseUrl();
    const basePath = `${baseUrl}/api/multi-dimension-tables/${table.code}/rows`;
    const teamAuthcode = userStore.user?.team_authcode;
    let curlCommand: string;

    if (mode === "add") {
      curlCommand = buildCurlCommandForApi({
        method: "POST",
        url: basePath,
        body: { cells: formValues },
        teamAuthcode,
      });
    } else if (mode === "edit" && row?.id) {
      curlCommand = buildCurlCommandForApi({
        method: "PUT",
        url: `${basePath}/${row.id}`,
        body: { cells: formValues },
        teamAuthcode,
      });
    } else if (mode === "delete" && row?.id) {
      curlCommand = buildCurlCommandForApi({
        method: "DELETE",
        url: `${basePath}/${row.id}`,
        teamAuthcode,
      });
    } else {
      return;
    }

    try {
      await navigator.clipboard.writeText(curlCommand);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    } catch {
      // ignore
    }
  }, [table?.code, mode, row?.id, formValues]);

  const title =
    mode === "add" ? "添加记录" : mode === "edit" ? "修改记录" : "删除记录";
  const description =
    mode === "add"
      ? "填写以下字段后保存，将新增一条记录"
      : mode === "edit"
        ? "修改以下字段后保存"
        : `确定要删除这条记录吗？此操作不可撤销。`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85dvh] sm:max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0 mx-auto">
        <DialogHeader className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 pr-12 border-b">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4">
        {mode === "delete" ? (
          <div>
            {row?.cells && (
              <div className="rounded-lg border p-3 bg-muted/50 text-sm space-y-1">
                {columns.map((col) => (
                  <div key={col.key} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">{col.label}:</span>
                    <span>{String(row.cells[col.key] ?? "-")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {columns.map((col) => (
              <div key={col.key} className="space-y-2">
                <Label htmlFor={col.key}>{col.label}</Label>
                <TableColumnFormField
                  column={col}
                  value={formValues[col.key] ?? ""}
                  onChange={(v) => setFormValues((prev) => ({ ...prev, [col.key]: v }))}
                />
              </div>
            ))}
          </div>
        )}
        </div>

        <DialogFooter className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t flex flex-col-reverse sm:flex-row items-stretch sm:items-center !justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyCurl}
            >
              {copiedCurl ? (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-1" />
                  复制 CURL
                </>
              )}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              variant={mode === "delete" ? "destructive" : "default"}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "处理中..." : mode === "delete" ? "删除" : "保存"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
