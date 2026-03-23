"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ResponsivePopover } from "@/components/ui/responsive-popover";
import { ResponsiveMenu } from "@/components/ui/responsive-menu";
import { Plus, Undo2, Redo2, Save, Upload, Filter, Search, Pencil, Trash2, ChevronDownIcon, EyeOff } from "@/components/icons";
import type { FilterGroup } from "./table-canvas-types";

export interface TableCanvasToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  showUndoRedo: boolean;
  onAddRow: () => void;
  filterGroups: FilterGroup[];
  showFilterPanel: boolean;
  onFilterPanelChange: (open: boolean) => void;
  filterPopoverContent: React.ReactNode;
  /** 隐藏列 Popover 内容（有值时在「按条件」右侧显示「隐藏列」按钮） */
  columnVisibilityPopoverContent?: React.ReactNode;
  /** 当前隐藏的列数量（用于显示徽章，如「隐藏列 (3)」） */
  columnVisibilityHiddenCount?: number;
  conditionMenuOpen: boolean;
  onConditionMenuOpenChange: (open: boolean) => void;
  onEditByCondition?: () => void;
  onDeleteByCondition?: () => void;
  onQueryByCondition?: () => void;
  onImportClick?: () => void;
  toolbarExtraLeftOfSave?: React.ReactNode;
  onSave?: () => void;
  saving?: boolean;
  hasUnsavedChanges?: boolean;
}

export function TableCanvasToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  showUndoRedo,
  onAddRow,
  filterGroups,
  showFilterPanel,
  onFilterPanelChange,
  filterPopoverContent,
  columnVisibilityPopoverContent,
  columnVisibilityHiddenCount = 0,
  conditionMenuOpen,
  onConditionMenuOpenChange,
  onEditByCondition,
  onDeleteByCondition,
  onQueryByCondition,
  onImportClick,
  toolbarExtraLeftOfSave,
  onSave,
  saving = false,
  hasUnsavedChanges = false,
}: TableCanvasToolbarProps) {
  const hasConditionActions = !!(onEditByCondition || onDeleteByCondition || onQueryByCondition);
  const [columnVisibilityOpen, setColumnVisibilityOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 sm:p-3 border-b bg-muted/50 shrink-0">
      {showUndoRedo && (
        <>
          <Button size="icon" variant="outline" onClick={onUndo} disabled={!canUndo} title="撤销 (Ctrl+Z)" className="shrink-0">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={onRedo} disabled={!canRedo} title="重做 (Ctrl+Y)" className="shrink-0">
            <Redo2 className="h-4 w-4" />
          </Button>
          <div className="h-6 w-px bg-border mx-1" />
        </>
      )}

      <Button size="icon" variant="outline" onClick={onAddRow} className="shrink-0" title="添加">
        <Plus className="h-4 w-4 shrink-0" />
      </Button>

      <ResponsivePopover
        open={showFilterPanel}
        onOpenChange={onFilterPanelChange}
        trigger={
          <Button size="sm" variant={filterGroups.length > 0 ? "default" : "outline"} className="gap-1.5 shrink-0">
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">筛选</span>
            {filterGroups.length > 0 && (
              <span className="bg-primary-foreground text-primary px-1.5 py-0.5 rounded text-xs">
                {filterGroups.reduce((sum, g) => sum + g.conditions.length, 0)}
              </span>
            )}
          </Button>
        }
        title="筛选条件"
        align="start"
        contentClassName="w-full sm:min-w-[480px] sm:w-[min(560px,92vw)] max-h-[min(70vh,520px)] overflow-y-auto p-4"
        content={filterPopoverContent}
      />

      {hasConditionActions && (
        <ResponsiveMenu
          open={conditionMenuOpen}
          onOpenChange={onConditionMenuOpenChange}
          trigger={
            <Button size="sm" variant="outline" className="gap-1 shrink-0">
              <span className="hidden sm:inline">按条件</span>
              <ChevronDownIcon className="h-4 w-4 shrink-0" />
            </Button>
          }
          title="按条件操作"
          align="start"
          items={[
            ...(onQueryByCondition ? [{ icon: <Search className="h-4 w-4" />, label: "按条件查找", onClick: onQueryByCondition }] : []),
            ...(onEditByCondition ? [{ icon: <Pencil className="h-4 w-4" />, label: "按条件编辑", onClick: onEditByCondition }] : []),
            ...(onDeleteByCondition
              ? [{ icon: <Trash2 className="h-4 w-4" />, label: "按条件删除", onClick: onDeleteByCondition, variant: "destructive" as const }]
              : []),
          ]}
        />
      )}

      {columnVisibilityPopoverContent && (
        <ResponsivePopover
          open={columnVisibilityOpen}
          onOpenChange={setColumnVisibilityOpen}
          trigger={
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0">
              <EyeOff className="h-4 w-4" />
              <span className="hidden sm:inline">隐藏列</span>
              {columnVisibilityHiddenCount > 0 && (
                <span className="bg-primary-foreground text-primary px-1.5 py-0.5 rounded text-xs">
                  {columnVisibilityHiddenCount}
                </span>
              )}
              <ChevronDownIcon className="h-3 w-3 shrink-0" />
            </Button>
          }
          title="设置列"
          align="start"
          contentClassName="w-[min(260px,92vw)] max-h-[min(70vh,420px)] overflow-y-auto p-3"
          content={columnVisibilityPopoverContent}
        />
      )}

      <div className="flex flex-wrap items-center gap-2 ml-auto">
        {onImportClick && (
          <Button size="icon" variant="outline" onClick={onImportClick} className="shrink-0" title="导入文件（Excel / CSV）">
            <Upload className="h-4 w-4" />
          </Button>
        )}
        {toolbarExtraLeftOfSave}
        {onSave && (
          <Button size="sm" onClick={onSave} disabled={saving || !hasUnsavedChanges} className="gap-1.5 shrink-0">
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">{saving ? "保存中..." : "保存"}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
