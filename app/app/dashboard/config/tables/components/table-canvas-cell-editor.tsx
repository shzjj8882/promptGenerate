"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { ResponsivePopover } from "@/components/ui/responsive-popover";
import { ChevronDownIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { TableColumn as TableColumnType } from "@/lib/api/multi-dimension-tables";

export interface TableCanvasCellEditorProps {
  col: TableColumnType;
  cellValue: string;
  setCellValue: (v: string) => void;
  onBlur: (finalValue?: string) => void;
  onClearEditing: () => void;
  singleSelectOpen: boolean;
  setSingleSelectOpen: (open: boolean) => void;
  multiSelectOpen: { rowId: string; columnKey: string } | null;
  setMultiSelectOpen: (v: { rowId: string; columnKey: string } | null) => void;
  editingCell: { rowId: string; columnKey: string } | null;
  originalValueRef: React.MutableRefObject<string>;
  onCellChange: (rowId: string, columnKey: string, value: string) => void;
  multiSelectTriggerRef: React.RefObject<HTMLButtonElement | null>;
}

export function TableCanvasCellEditor({
  col,
  cellValue,
  setCellValue,
  onBlur,
  onClearEditing,
  singleSelectOpen,
  setSingleSelectOpen,
  multiSelectOpen,
  setMultiSelectOpen,
  editingCell,
  originalValueRef,
  onCellChange,
  multiSelectTriggerRef,
}: TableCanvasCellEditorProps) {
  const t = col.type || "text";
  const handleKeyEscape = () => {
    onClearEditing();
  };

  switch (t) {
    case "number":
      return (
        <Input
          type="number"
          value={cellValue}
          onChange={(e) => setCellValue(e.target.value)}
          onBlur={() => onBlur()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onBlur();
            } else if (e.key === "Escape") handleKeyEscape();
          }}
          className="h-full w-full border-0 focus-visible:ring-0 p-2"
          autoFocus
        />
      );
    case "date":
      return (
        <div className="h-full w-full p-1">
          <DatePicker
            value={cellValue}
            onChange={(v) => {
              const next = v || "";
              setCellValue(next);
              onBlur(next);
            }}
            format={col.options?.format || "YYYY/MM/DD"}
            className="h-full"
            autoOpen
          />
        </div>
      );
    case "single_select": {
      const singleOptions = col.options?.options || [];
      return (
        <Select
          value={cellValue}
          onValueChange={(v) => {
            setCellValue(v);
            onBlur(v);
          }}
          open={singleSelectOpen}
          onOpenChange={(o) => !o && (setSingleSelectOpen(false), onBlur())}
        >
          <SelectTrigger className="h-full w-full border-0 rounded-none">
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            {singleOptions.map((opt: string) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "multi_select": {
      const multiOptions = col.options?.options || [];
      const selectedValues = cellValue
        ? [...new Set(cellValue.split(/[,\s]+/).map((v) => v.trim()).filter((v) => v))]
        : [];
      const isOpen =
        multiSelectOpen?.rowId === editingCell?.rowId && multiSelectOpen?.columnKey === editingCell?.columnKey;
      const content = (
        <div className="max-h-60 overflow-y-auto custom-scrollbar">
          {multiOptions
            .filter((o: string) => o?.trim())
            .map((opt: string) => (
              <div
                key={opt}
                className={cn(
                  "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pr-8 pl-8 text-sm outline-none hover:bg-accent"
                )}
                onClick={() => {
                  const checked = selectedValues.includes(opt);
                  setCellValue(
                    checked ? selectedValues.filter((v) => v !== opt).join(",") : [...selectedValues, opt].join(",")
                  );
                }}
              >
                <div className="absolute left-2 flex h-4 w-4 items-center justify-center">
                  <Checkbox
                    checked={selectedValues.includes(opt)}
                    onCheckedChange={(checked) => {
                      const c = selectedValues.includes(opt);
                      if (checked && !c) setCellValue([...selectedValues, opt].join(","));
                      else if (!checked && c) setCellValue(selectedValues.filter((v) => v !== opt).join(","));
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <span className="flex-1">{opt}</span>
              </div>
            ))}
        </div>
      );
      return (
        <ResponsivePopover
          open={isOpen}
          onOpenChange={(o) => {
            if (o) setMultiSelectOpen(editingCell ? { rowId: editingCell.rowId, columnKey: editingCell.columnKey } : null);
            else {
              setMultiSelectOpen(null);
              if (editingCell) {
                const nextValue = [...new Set(cellValue.split(/[,\s]+/).map((v) => v.trim()).filter((v) => v))].join(",");
                if (nextValue !== originalValueRef.current) {
                  onCellChange(editingCell.rowId, editingCell.columnKey, nextValue);
                }
              }
            }
          }}
          trigger={
            <button
              ref={multiSelectTriggerRef}
              type="button"
              className={cn(
                "h-full w-full flex items-center justify-between gap-2 rounded-none border-0 bg-transparent px-3 py-2 text-sm",
                selectedValues.length === 0 && "text-muted-foreground"
              )}
            >
              <span className="truncate flex-1 text-left">
                {selectedValues.length > 0 ? selectedValues.join(", ") : "请选择"}
              </span>
              <ChevronDownIcon className="h-4 w-4 opacity-50 shrink-0" />
            </button>
          }
          title="多选"
          content={content}
        />
      );
    }
    default:
      return (
        <Input
          value={cellValue}
          onChange={(e) => setCellValue(e.target.value)}
          onBlur={() => onBlur()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onBlur();
            } else if (e.key === "Escape") handleKeyEscape();
          }}
          className="h-full w-full border-0 focus-visible:ring-0 p-2"
          autoFocus
        />
      );
  }
}
