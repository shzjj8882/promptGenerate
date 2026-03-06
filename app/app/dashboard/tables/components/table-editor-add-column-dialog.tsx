"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "@/components/icons";
import { DatePicker, DATE_FORMATS } from "@/components/ui/date-picker";
import { convertDateFormat } from "@/lib/utils/date-format";
import { Checkbox } from "@/components/ui/checkbox";
import type { MultiDimensionTable } from "@/lib/api/multi-dimension-tables";
import type { ColumnFormOptionItem } from "../table-editor-types";

export interface TableEditorAddColumnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: MultiDimensionTable | null;
  insertPosition: { side: "left" | "right"; columnKey: string } | null;
  copyFromKey: string | null;
  columnKey: string;
  setColumnKey: (v: string) => void;
  label: string;
  setLabel: (v: string) => void;
  type: string;
  setType: (v: string) => void;
  options: ColumnFormOptionItem[];
  setOptions: (v: ColumnFormOptionItem[] | ((prev: ColumnFormOptionItem[]) => ColumnFormOptionItem[])) => void;
  dateFormat: string;
  setDateFormat: (v: string) => void;
  defaultValue: string;
  setDefaultValue: (v: string) => void;
  onSubmit: () => void;
}

export function TableEditorAddColumnDialog({
  open,
  onOpenChange,
  table,
  insertPosition,
  copyFromKey,
  columnKey,
  setColumnKey,
  label,
  setLabel,
  type: columnType,
  setType: setColumnType,
  options,
  setOptions,
  dateFormat,
  setDateFormat,
  defaultValue,
  setDefaultValue,
  onSubmit,
}: TableEditorAddColumnDialogProps) {
  const description =
    copyFromKey != null
      ? (() => {
          const col = table?.columns.find((c) => c.key === copyFromKey);
          return col ? `复制自「${col.label}」列，可修改后确认，保存后新列单元格将填入源列内容` : "添加一个新的列到表格中";
        })()
      : insertPosition != null
        ? (() => {
            const col = table?.columns.find((c) => c.key === insertPosition.columnKey);
            return col
              ? `新列将插入到「${col.label}」的${insertPosition.side === "left" ? "左侧" : "右侧"}`
              : "添加一个新的列到表格中";
          })()
        : "添加一个新的列到表格中";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setColumnKey("");
          setLabel("");
          setColumnType("text");
          setOptions([]);
          setDateFormat("YYYY/MM/DD");
          setDefaultValue("");
        }
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[85dvh] sm:max-h-[90vh] mx-auto overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copyFromKey ? "复制列" : "添加列"}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="column-key">
              Key <span className="text-destructive">*</span>
            </Label>
            <Input
              id="column-key"
              value={columnKey}
              onChange={(e) => setColumnKey(e.target.value)}
              placeholder="例如: email"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">列的唯一标识，创建后不可修改</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="column-label">
              列名称 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="column-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例如: 邮箱"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="column-type">
              数据类型 <span className="text-destructive">*</span>
            </Label>
            <Select
              value={columnType}
              onValueChange={(value) => {
                setColumnType(value);
                if (value !== "single_select" && value !== "multi_select") setOptions([]);
                if (value !== "date") setDateFormat("YYYY/MM/DD");
                setDefaultValue("");
              }}
            >
              <SelectTrigger id="column-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="w-full">
                <SelectItem value="text">文本</SelectItem>
                <SelectItem value="number">数字</SelectItem>
                <SelectItem value="date">日期</SelectItem>
                <SelectItem value="single_select">单选</SelectItem>
                <SelectItem value="multi_select">多选</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(columnType === "single_select" || columnType === "multi_select") && (
            <div className="space-y-2">
              <Label>选项配置 <span className="text-destructive">*</span></Label>
              <p className="text-xs text-muted-foreground">至少需要添加一个选项，选项值不能为空且不能重复</p>
              <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                {options.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">暂无选项，请点击下方按钮添加</p>
                ) : (
                  options.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={option.value}
                        onChange={(e) => {
                          const updated = [...options];
                          updated[index] = { ...updated[index], value: e.target.value };
                          setOptions(updated);
                        }}
                        placeholder={`选项 ${index + 1}`}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setOptions(options.filter((_, i) => i !== index))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => setOptions([...options, { key: "", value: "" }])} className="w-full">
                  <Plus className="h-4 w-4 mr-1" /> 添加选项
                </Button>
              </div>
            </div>
          )}

          {columnType === "date" && (
            <div className="space-y-2">
              <Label>日期格式</Label>
              <Select
                value={dateFormat}
                onValueChange={(newFormat) => {
                  if (defaultValue) {
                    const converted = convertDateFormat(defaultValue, dateFormat, newFormat);
                    setDefaultValue(converted);
                  }
                  setDateFormat(newFormat);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="w-full">
                  {DATE_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>默认值</Label>
            {columnType === "date" ? (
              <DatePicker value={defaultValue} onChange={setDefaultValue} format={dateFormat} placeholder="选择默认日期" />
            ) : columnType === "single_select" ? (
              <Select value={defaultValue || "__none__"} onValueChange={(v) => setDefaultValue(v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择默认值（可选）" />
                </SelectTrigger>
                <SelectContent className="w-full">
                  <SelectItem value="__none__">无默认值</SelectItem>
                  {options.filter((o) => o.value.trim()).map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : columnType === "multi_select" ? (
              <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                {options.filter((o) => o.value.trim()).length === 0 ? (
                  <p className="text-sm text-muted-foreground">请先配置选项</p>
                ) : (
                  options.filter((o) => o.value.trim()).map((option) => {
                    const selected = defaultValue ? defaultValue.split(",").filter((v) => v) : [];
                    return (
                      <div key={option.value} className="flex items-center space-x-2">
                        <Checkbox
                          checked={selected.includes(option.value)}
                          onCheckedChange={(checked) => {
                            const next = checked ? [...selected, option.value] : selected.filter((v) => v !== option.value);
                            setDefaultValue(next.join(","));
                          }}
                        />
                        <label
                          className="text-sm cursor-pointer"
                          onClick={() => {
                            const sel = defaultValue ? defaultValue.split(",").filter((v) => v) : [];
                            const isChecked = sel.includes(option.value);
                            const next = isChecked ? sel.filter((v) => v !== option.value) : [...sel, option.value];
                            setDefaultValue(next.join(","));
                          }}
                        >
                          {option.value}
                        </label>
                      </div>
                    );
                  })
                )}
              </div>
            ) : columnType === "number" ? (
              <Input type="number" value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} placeholder="可选，新建行时自动填充此值" />
            ) : (
              <Input value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} placeholder="可选，新建行时自动填充此值" />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={onSubmit}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
