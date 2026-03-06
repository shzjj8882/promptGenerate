"use client";

import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TableColumn } from "@/lib/api/multi-dimension-tables";
import { COL_TYPE_TO_ICON } from "@/app/dashboard/config/tables/components/table-canvas-utils";
import type { HeaderIconType } from "@/lib/canvas-grid-renderer";

export interface TableEditorColumnVisibilitySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: TableColumn[];
  hiddenColumnKeys: string[];
  onHiddenColumnKeysChange: (keys: string[]) => void;
}

const ICON_LABELS: Record<HeaderIconType | string, string> = {
  text: "文本",
  number: "数字",
  date: "日期",
  single_select: "单选",
  multi_select: "多选",
  add_column: "",
};

function ColumnTypeIcon({ type }: { type?: string }) {
  const iconType = (type && COL_TYPE_TO_ICON[type]) ? COL_TYPE_TO_ICON[type] : "text";
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-muted/50 text-[10px] font-medium text-muted-foreground"
      title={ICON_LABELS[iconType] ?? type ?? "文本"}
    >
      {iconType === "number" ? "0" : iconType === "date" ? "日" : iconType === "single_select" || iconType === "multi_select" ? "选" : "A"}
    </span>
  );
}

export function TableEditorColumnVisibilitySheet({
  open,
  onOpenChange,
  columns,
  hiddenColumnKeys,
  onHiddenColumnKeysChange,
}: TableEditorColumnVisibilitySheetProps) {
  const [search, setSearch] = useState("");

  const filteredColumns = useMemo(() => {
    if (!search.trim()) return columns;
    const q = search.trim().toLowerCase();
    return columns.filter(
      (c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q)
    );
  }, [columns, search]);

  const toggle = (columnKey: string, visible: boolean) => {
    if (visible) {
      onHiddenColumnKeysChange(hiddenColumnKeys.filter((k) => k !== columnKey));
    } else {
      onHiddenColumnKeysChange([...hiddenColumnKeys, columnKey]);
    }
  };

  const hideAll = () => {
    onHiddenColumnKeysChange(columns.map((c) => c.key));
  };

  const showAll = () => {
    onHiddenColumnKeysChange([]);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 overflow-hidden">
        <SheetHeader className="shrink-0 pb-2">
          <SheetTitle>设置列</SheetTitle>
          <p className="text-xs text-muted-foreground font-normal">
            列显示/隐藏仅保存在本机（localStorage），不影响其他成员。
          </p>
        </SheetHeader>

        <div className="flex flex-col flex-1 min-h-0 pt-4">
          <div className="shrink-0 space-y-3 pb-3">
            <Input
              placeholder="搜索列名"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={hideAll} className="flex-1">
                隐藏所有
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={showAll} className="flex-1">
                显示所有
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto border rounded-lg">
            <ul className="divide-y divide-border">
              {filteredColumns.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {search.trim() ? "无匹配列" : "暂无数据列"}
                </li>
              ) : (
                filteredColumns.map((col) => {
                  const isVisible = !hiddenColumnKeys.includes(col.key);
                  return (
                    <li
                      key={col.key}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 text-sm",
                        !isVisible && "opacity-70"
                      )}
                    >
                      <ColumnTypeIcon type={col.type} />
                      <span className="min-w-0 flex-1 truncate" title={col.label}>
                        {col.label}
                      </span>
                      <Switch
                        checked={isVisible}
                        onCheckedChange={(checked) => toggle(col.key, checked)}
                        aria-label={isVisible ? `隐藏「${col.label}」` : `显示「${col.label}」`}
                      />
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
