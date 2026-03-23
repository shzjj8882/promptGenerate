"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TableColumn } from "@/lib/api/multi-dimension-tables";
import { COL_TYPE_TO_ICON } from "@/app/dashboard/config/tables/components/table-canvas-utils";
import type { HeaderIconType } from "@/lib/canvas-grid-renderer";

export interface TableEditorColumnVisibilityPopoverProps {
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

/**
 * 列显示/隐藏 Popover 内容
 * 用于工具栏「隐藏列」按钮的下拉
 */
export function TableEditorColumnVisibilityPopover({
  columns,
  hiddenColumnKeys,
  onHiddenColumnKeysChange,
}: TableEditorColumnVisibilityPopoverProps) {
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
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        列显示/隐藏仅保存在本机（localStorage），不影响其他成员。
      </p>
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
      <div className="max-h-[min(240px,50vh)] overflow-y-auto border rounded-lg -mx-1">
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
  );
}
