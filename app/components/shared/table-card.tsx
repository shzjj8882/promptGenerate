"use client";

import { memo } from "react";
import { Table } from "lucide-react";
import { ActionButtons } from "@/components/shared/action-buttons";
import { useRouter } from "next/navigation";
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
 * 使用 React.memo 优化性能，避免不必要的重新渲染
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
      className="group relative rounded-lg border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md cursor-pointer"
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
            <Table className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground mb-1 truncate">
              {table.name}
            </h3>
            <p className="text-xs text-muted-foreground font-mono mb-2">{table.code}</p>
            {table.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 break-words mb-3">
                {table.description}
              </p>
            )}
            
            {/* 字段名称列表 */}
            {table.columns && table.columns.length > 0 ? (
              <div className="mb-3">
                <p className="text-xs text-muted-foreground mb-1.5">字段：</p>
                <div className="flex items-center gap-1 overflow-x-auto">
                  {table.columns.slice(0, 10).map((col) => (
                    <span
                      key={col.key}
                      className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground whitespace-nowrap flex-shrink-0"
                    >
                      {col.label}
                    </span>
                  ))}
                  {table.columns.length > 10 && (
                    <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground whitespace-nowrap flex-shrink-0">
                      +{table.columns.length - 10}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mb-3">暂无字段</p>
            )}
            
            {/* 统计信息 */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{table.columns?.length || 0} 列</span>
              <span>•</span>
              <span>{table.row_count ?? 0} 条数据</span>
            </div>
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
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
