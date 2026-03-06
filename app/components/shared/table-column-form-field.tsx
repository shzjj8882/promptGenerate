"use client";

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
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import type { TableColumn } from "@/lib/api/multi-dimension-tables";

interface TableColumnFormFieldProps {
  column: TableColumn;
  value: string;
  onChange: (value: string) => void;
  /** 文本/数字输入使用 Input 而非 Textarea，默认 false */
  useInputForText?: boolean;
}

/**
 * 根据表格列类型渲染对应的表单控件
 * 用于 row-record-dialog、row-condition-dialog 等场景
 */
export function TableColumnFormField({
  column,
  value,
  onChange,
  useInputForText = false,
}: TableColumnFormFieldProps) {
  const columnType = column.type || "text";
  const options = column.options?.options || [];

  switch (columnType) {
    case "number":
      return (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`请输入${column.label}`}
        />
      );
    case "date":
      return (
        <DatePicker
          value={value}
          onChange={(v) => onChange(v || "")}
          format={column.options?.format || "YYYY/MM/DD"}
          className="w-full"
        />
      );
    case "single_select":
      return (
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder={`请选择${column.label}`} />
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
    case "multi_select": {
      const selectedValues = value ? value.split(",").filter((v) => v) : [];
      return (
        <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">请先配置列选项</p>
          ) : (
            options.map((opt: string) => (
              <div key={opt} className="flex items-center gap-2">
                <Checkbox
                  id={`${column.key}-${opt}`}
                  checked={selectedValues.includes(opt)}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...selectedValues, opt]
                      : selectedValues.filter((v) => v !== opt);
                    onChange(next.join(","));
                  }}
                />
                <Label
                  htmlFor={`${column.key}-${opt}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {opt}
                </Label>
              </div>
            ))
          )}
        </div>
      );
    }
    default:
      return useInputForText ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`请输入${column.label}`}
        />
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`请输入${column.label}`}
          rows={2}
          className="resize-none"
        />
      );
  }
}
