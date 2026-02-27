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
import type { MultiDimensionTable, TableColumn } from "@/lib/api/multi-dimension-tables";

export type RowConditionDialogMode = "edit_by_condition" | "delete_by_condition";

interface RowConditionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: RowConditionDialogMode;
  table: MultiDimensionTable;
  onSubmit: (
    mode: RowConditionDialogMode,
    condition: { column_key: string; value: string },
    cells?: Record<string, string>
  ) => void | Promise<void>;
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

export function RowConditionDialog({
  open,
  onOpenChange,
  mode,
  table,
  onSubmit,
}: RowConditionDialogProps) {
  const [conditionColumnKey, setConditionColumnKey] = useState<string>("");
  const [conditionValue, setConditionValue] = useState("");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const columns = table?.columns || [];
  const conditionOptions = [
    { key: "row_id", label: "行号 (row_id)" },
    ...columns.map((c) => ({ key: c.key, label: c.label })),
  ];

  useEffect(() => {
    if (!open) return;
    setConditionColumnKey(columns[0]?.key || "row_id");
    setConditionValue("");
    if (mode === "edit_by_condition") {
      const initial: Record<string, string> = {};
      columns.forEach((col) => {
        initial[col.key] = col.options?.defaultValue || "";
      });
      setFormValues(initial);
    }
  }, [open, mode, columns]);

  const handleSubmit = useCallback(async () => {
    if (!conditionColumnKey.trim()) return;
    const val = String(conditionValue ?? "").trim();
    if (!val) return;
    if (conditionColumnKey === "row_id" && isNaN(Number(val))) return;

    const condition = {
      column_key: conditionColumnKey,
      value: conditionColumnKey === "row_id" ? String(Number(val)) : val,
    };

    setSubmitting(true);
    try {
      if (mode === "edit_by_condition") {
        await onSubmit(mode, condition, formValues);
      } else {
        await onSubmit(mode, condition);
      }
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }, [mode, conditionColumnKey, conditionValue, formValues, onSubmit, onOpenChange]);

  const handleCopyCurl = useCallback(async () => {
    if (!table?.id) return;

    const baseUrl = getCurlBaseUrl();
    const url = `${baseUrl}/admin/multi-dimension-tables/${table.id}/rows/by-condition`;

    const curlCommand =
      mode === "delete_by_condition"
        ? buildCurlCommand({
            method: "DELETE",
            url,
            body: {
              condition: {
                column_key: conditionColumnKey,
                value: String(conditionValue),
              },
            },
          })
        : buildCurlCommand({
            method: "PUT",
            url,
            body: {
              condition: {
                column_key: conditionColumnKey,
                value: String(conditionValue),
              },
              cells: formValues,
            },
          });

    try {
      await navigator.clipboard.writeText(curlCommand);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    } catch {
      // ignore
    }
  }, [table?.id, mode, conditionColumnKey, conditionValue, formValues]);

  const title =
    mode === "edit_by_condition" ? "按条件编辑记录" : "按条件删除记录";
  const description =
    mode === "edit_by_condition"
      ? "设置匹配条件，将匹配到的所有行的单元格更新为下方填写的新值"
      : "设置匹配条件，将删除所有满足条件的行，此操作不可撤销";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85dvh] sm:max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0 mx-auto">
        <DialogHeader className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 pr-12 border-b">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-4">
          {/* 条件区域 */}
          <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
            <div className="text-sm font-medium">匹配条件</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>条件列</Label>
                <Select
                  value={conditionColumnKey}
                  onValueChange={(v) => {
                    setConditionColumnKey(v);
                    if (v === "row_id") setConditionValue("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择列" />
                  </SelectTrigger>
                  <SelectContent>
                    {conditionOptions.map((opt) => (
                      <SelectItem key={opt.key} value={opt.key}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>条件值</Label>
                <Input
                  type={conditionColumnKey === "row_id" ? "number" : "text"}
                  value={conditionValue}
                  onChange={(e) => setConditionValue(e.target.value)}
                  placeholder={
                    conditionColumnKey === "row_id" ? "行号" : "输入匹配值"
                  }
                />
              </div>
            </div>
          </div>

          {/* 编辑模式：单元格表单 */}
          {mode === "edit_by_condition" && (
            <div className="space-y-4">
              <div className="text-sm font-medium">更新为以下值</div>
              {columns.map((col) => (
                <div key={col.key} className="space-y-2">
                  <Label htmlFor={`cond-${col.key}`}>{col.label}</Label>
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
              variant={mode === "delete_by_condition" ? "destructive" : "default"}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "处理中..." : mode === "delete_by_condition" ? "删除" : "保存"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
