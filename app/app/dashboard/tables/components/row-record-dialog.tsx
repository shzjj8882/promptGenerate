"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Check } from "lucide-react";
import { buildCurlCommand, getCurlBaseUrl } from "@/lib/utils/curl";
import type { MultiDimensionTable, TableRow as TableRowType, TableColumn } from "@/lib/api/multi-dimension-tables";

export type RowRecordDialogMode = "add" | "edit" | "delete";

interface RowRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: RowRecordDialogMode;
  table: MultiDimensionTable;
  row?: TableRowType;
  onSubmit: (mode: RowRecordDialogMode, cells?: Record<string, string>) => void | Promise<void>;
}

/** 根据列类型渲染表单控件 */
function renderFormField(
  col: TableColumn,
  value: string,
  onChange: (v: string) => void
) {
  const columnType = col.type || "text";
  const options = col.options?.options || [];

  switch (columnType) {
    case "number":
      return (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`请输入${col.label}`}
        />
      );
    case "date":
      return (
        <DatePicker
          value={value}
          onChange={(v) => onChange(v || "")}
          format={col.options?.format || "YYYY/MM/DD"}
          className="w-full"
        />
      );
    case "single_select":
      return (
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder={`请选择${col.label}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt: string) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multi_select":
      const selectedValues = value ? value.split(",").filter((v) => v) : [];
      return (
        <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">请先配置列选项</p>
          ) : (
            options.map((opt: string) => (
              <div key={opt} className="flex items-center gap-2">
                <Checkbox
                  id={`${col.key}-${opt}`}
                  checked={selectedValues.includes(opt)}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...selectedValues, opt]
                      : selectedValues.filter((v) => v !== opt);
                    onChange(next.join(","));
                  }}
                />
                <Label htmlFor={`${col.key}-${opt}`} className="text-sm font-normal cursor-pointer">
                  {opt}
                </Label>
              </div>
            ))
          )}
        </div>
      );
    default:
      return (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`请输入${col.label}`}
          rows={2}
          className="resize-none"
        />
      );
  }
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
    if (!table?.id) return;

    const baseUrl = getCurlBaseUrl();
    let curlCommand: string;

    if (mode === "add") {
      curlCommand = buildCurlCommand({
        method: "POST",
        url: `${baseUrl}/admin/multi-dimension-tables/${table.id}/rows`,
        body: { cells: formValues },
      });
    } else if (mode === "edit" && row?.id) {
      curlCommand = buildCurlCommand({
        method: "PUT",
        url: `${baseUrl}/admin/multi-dimension-tables/${table.id}/rows/${row.id}`,
        body: { cells: formValues },
      });
    } else if (mode === "delete" && row?.id) {
      curlCommand = buildCurlCommand({
        method: "DELETE",
        url: `${baseUrl}/admin/multi-dimension-tables/${table.id}/rows/${row.id}`,
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
  }, [table?.id, mode, row?.id, formValues]);

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
                {renderFormField(
                  col,
                  formValues[col.key] ?? "",
                  (v) => setFormValues((prev) => ({ ...prev, [col.key]: v }))
                )}
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
