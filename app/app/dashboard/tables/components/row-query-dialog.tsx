"use client";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Check, Plus, X } from "lucide-react";
import type { MultiDimensionTable } from "@/lib/api/multi-dimension-tables";
import { useRowQuery } from "../hooks/use-row-query";

const OPERATORS = [
  { value: "equals", label: "等于" },
  { value: "contains", label: "包含" },
  { value: "not_equals", label: "不等于" },
  { value: "not_contains", label: "不包含" },
  { value: "starts_with", label: "开头是" },
  { value: "ends_with", label: "结尾是" },
];

interface RowQueryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: MultiDimensionTable;
}

export function RowQueryDialog({ open, onOpenChange, table }: RowQueryDialogProps) {
  const {
    conditions,
    logic,
    limitOne,
    setLogic,
    setLimitOne,
    addCondition,
    removeCondition,
    updateCondition,
    conditionOptions,
    loading,
    result,
    copiedCurl,
    handleQuery,
    handleCopyCurl,
  } = useRowQuery({ table, open });

  const columns = table?.columns ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85dvh] sm:max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0 mx-auto">
        <DialogHeader className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 pr-12 border-b">
          <DialogTitle>按条件查找</DialogTitle>
          <DialogDescription>
            支持多个条件组合查询，可选择返回单条或多条数据
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>查询条件</Label>
              <Button type="button" variant="outline" size="sm" onClick={addCondition}>
                <Plus className="h-4 w-4 mr-1" />
                添加条件
              </Button>
            </div>
            <div className="space-y-2">
              {conditions.map((cond, index) => (
                <div key={index} className="flex items-center gap-2 flex-wrap">
                  {index > 0 && (
                    <Select value={logic} onValueChange={(v) => setLogic(v as "and" | "or")}>
                      <SelectTrigger className="w-14 sm:w-16 h-8 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="and">并且</SelectItem>
                        <SelectItem value="or">或者</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Select
                    value={cond.column_key}
                    onValueChange={(v) => updateCondition(index, "column_key", v)}
                  >
                    <SelectTrigger className="w-full min-w-[100px] sm:w-36 h-8">
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
                  <Select
                    value={cond.operator || "equals"}
                    onValueChange={(v) => updateCondition(index, "operator", v)}
                  >
                    <SelectTrigger className="w-20 sm:w-24 h-8 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type={cond.column_key === "row_id" ? "number" : "text"}
                    value={cond.value}
                    onChange={(e) => updateCondition(index, "value", e.target.value)}
                    placeholder="条件值"
                    className="flex-1 min-w-[100px] h-8"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => removeCondition(index)}
                    disabled={conditions.length <= 1}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Label>返回</Label>
            <Select
              value={limitOne ? "1" : "all"}
              onValueChange={(v) => setLimitOne(v === "1")}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">多条数据</SelectItem>
                <SelectItem value="1">单条数据</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {result !== null && (
            <div className="border rounded-lg p-3 space-y-2">
              <div className="text-sm font-medium">
                共找到 {result.total} 条{limitOne ? "（仅显示第 1 条）" : ""}
              </div>
              {result.rows.length > 0 ? (
                <div className="max-h-48 overflow-y-auto border rounded-md">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">#</th>
                        {columns.map((col) => (
                          <th key={col.key} className="text-left p-2">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="p-2 text-muted-foreground">{row.row_id}</td>
                          {columns.map((col) => (
                            <td key={col.key} className="p-2 max-w-[120px] truncate">
                              {row.cells?.[col.key] ?? "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">无匹配数据</p>
              )}
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
                  <Check className="h-4 w-4 mr-1" />
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
              关闭
            </Button>
            <Button onClick={handleQuery} disabled={loading}>
              {loading ? "查询中..." : "查询"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
