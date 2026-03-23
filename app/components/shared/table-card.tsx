"use client";

import { memo } from "react";
import { TableFile } from "@/components/icons";
import { ActionButtons } from "@/components/shared/action-buttons";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CARD_ICON_VARIANTS, CARD_STYLES, TYPOGRAPHY } from "@/lib/design-tokens";
import type { MultiDimensionTable } from "@/lib/api/multi-dimension-tables";

interface TableCardProps {
  table: MultiDimensionTable;
  onEdit?: (table: MultiDimensionTable) => void;
  onDelete?: (table: MultiDimensionTable) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

/**
 * 多维表格卡片组件
 * 遵循设计规范：icon 高度 100%，文字层级统一
 */
export const TableCard = memo(function TableCard({
  table,
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
}: TableCardProps) {
  const router = useRouter();

  const handleCardClick = () => {
    router.push(`/dashboard/tables/${table.id}`);
  };

  return (
    <div
      className={cn(
        CARD_STYLES.listItem,
        // Grid：左列 icon，右列 文本+操作；行高由右侧内容决定
        "grid grid-cols-[auto_1fr] cursor-pointer items-stretch gap-4"
      )}
      onClick={handleCardClick}
    >
      {/* 图标区：Grid 左列，单元格高度 = 行高；内层 h-full + aspect-square => 严格正方形，随行高自适应 */}
      <div className="flex min-h-14 items-center justify-center self-stretch">
        <div
          className={cn(
            "flex aspect-square h-full min-w-14 min-h-14 items-center justify-center rounded-lg",
            CARD_ICON_VARIANTS.table
          )}
        >
          <TableFile theme="outline" size={24} fill="currentColor" strokeLinejoin="miter" />
        </div>
      </div>
      {/* 右列：文本 + 操作放在同一格里，避免多子元素导致第二行高度异常 */}
      <div className="flex min-w-0 items-stretch justify-between gap-4">
        <div className="flex flex-col justify-center min-w-0 py-0.5">
          <h3 className={cn(TYPOGRAPHY.cardTitle, "truncate mb-0.5")}>{table.name}</h3>
          <p className={cn(TYPOGRAPHY.caption, "font-mono mb-2")}>{table.code}</p>
          {table.description && (
            <p className={cn(TYPOGRAPHY.cardSubtitle, "line-clamp-2 break-words mb-2")}>
              {table.description}
            </p>
          )}
          {table.columns && table.columns.length > 0 ? (
            <div className="mb-2 min-w-0">
              <p className={cn(TYPOGRAPHY.caption, "mb-1")}>字段：</p>
              <p
                className={cn(TYPOGRAPHY.caption, "truncate")}
                title={table.columns.map((c) => c.label).join(", ")}
              >
                {table.columns.slice(0, 10).map((col) => col.label).join("、")}
                {table.columns.length > 10 ? ` +${table.columns.length - 10}` : ""}
              </p>
            </div>
          ) : (
            <p className={cn(TYPOGRAPHY.caption, "mb-2")}>暂无字段</p>
          )}
          <div className={cn(TYPOGRAPHY.caption, "flex items-center gap-2")}>
            <span>{table.columns?.length || 0} 列</span>
            <span>•</span>
            <span>{table.row_count ?? 0} 条数据</span>
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()} className="shrink-0 self-start">
          <ActionButtons
            onEdit={onEdit ? () => onEdit(table) : undefined}
            onDelete={onDelete ? () => onDelete(table) : undefined}
            canEdit={canEdit}
            canDelete={canDelete}
            variant="inline"
            size="sm"
          />
        </div>
      </div>
    </div>
  );
});
