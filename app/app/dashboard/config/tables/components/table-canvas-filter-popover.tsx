"use client";

/**
 * TableCanvas 筛选弹窗内容：筛选组、条件、添加/删除、清除、显示条数
 */
import { useCallback } from "react";
import { Plus, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FilterGroup, FilterLogic, FilterOperator } from "./table-canvas-types";

export interface TableCanvasFilterPopoverProps {
  filterGroups: FilterGroup[];
  setFilterGroups: React.Dispatch<React.SetStateAction<FilterGroup[]>>;
  /** 表格列（用于选择列、新条件默认列） */
  columns: Array<{ key: string; label: string }>;
  filteredCount: number;
  totalCount: number;
}

export function TableCanvasFilterPopover({
  filterGroups,
  setFilterGroups,
  columns,
  filteredCount,
  totalCount,
}: TableCanvasFilterPopoverProps) {
  const firstColumnKey = columns[0]?.key ?? "";

  const handleAddFilterGroup = useCallback(() => {
    setFilterGroups((prev) => [
      ...prev,
      {
        id: `group-${Date.now()}`,
        logic: "and" as FilterLogic,
        groupLogic: prev.length > 0 ? ("and" as FilterLogic) : undefined,
        conditions: [
          { id: `condition-${Date.now()}`, columnKey: firstColumnKey, operator: "contains" as FilterOperator, value: "" },
        ],
      },
    ]);
  }, [setFilterGroups, firstColumnKey]);

  return (
    <div className="space-y-4 min-w-[420px] max-h-[70vh] overflow-y-auto">
      {filterGroups.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4">
          暂无筛选条件，点击「添加筛选组」开始筛选
        </div>
      ) : (
        filterGroups.map((group, groupIndex) => (
          <div key={group.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                {groupIndex > 0 && (
                  <>
                    <span className="text-xs text-muted-foreground">组间关系：</span>
                    <Select
                      value={group.groupLogic ?? "and"}
                      onValueChange={(value: FilterLogic) => {
                        setFilterGroups((groups) =>
                          groups.map((g) => (g.id === group.id ? { ...g, groupLogic: value } : g))
                        );
                      }}
                    >
                      <SelectTrigger className="w-24 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="and">并且</SelectItem>
                        <SelectItem value="or">或者</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
                <span className="text-sm font-medium">筛选组 {groupIndex + 1}</span>
                <span className="text-xs text-muted-foreground">（组内条件：</span>
                <Select
                  value={group.logic}
                  onValueChange={(value: FilterLogic) => {
                    setFilterGroups((groups) =>
                      groups.map((g) => (g.id === group.id ? { ...g, logic: value } : g))
                    );
                  }}
                >
                  <SelectTrigger className="w-24 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="and">并且</SelectItem>
                    <SelectItem value="or">或者</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">）</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFilterGroups((groups) => groups.filter((g) => g.id !== group.id))}
                className="h-7 w-7 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {group.conditions.map((condition, conditionIndex) => (
                <div key={condition.id} className="flex items-center gap-2">
                  {conditionIndex > 0 && (
                    <span className="text-xs text-muted-foreground w-12 text-center">
                      {group.logic === "and" ? "并且" : "或者"}
                    </span>
                  )}
                  {conditionIndex === 0 && <div className="w-12" />}
                  <Select
                    value={condition.columnKey}
                    onValueChange={(value) => {
                      setFilterGroups((groups) =>
                        groups.map((g) =>
                          g.id === group.id
                            ? {
                                ...g,
                                conditions: g.conditions.map((c) =>
                                  c.id === condition.id ? { ...c, columnKey: value } : c
                                ),
                              }
                            : g
                        )
                      );
                    }}
                  >
                    <SelectTrigger className="w-40 h-8">
                      <SelectValue placeholder="选择列" />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((col) => (
                        <SelectItem key={col.key} value={col.key}>
                          {col.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={condition.operator}
                    onValueChange={(value: FilterOperator) => {
                      setFilterGroups((groups) =>
                        groups.map((g) =>
                          g.id === group.id
                            ? {
                                ...g,
                                conditions: g.conditions.map((c) =>
                                  c.id === condition.id ? { ...c, operator: value } : c
                                ),
                              }
                            : g
                        )
                      );
                    }}
                  >
                    <SelectTrigger className="w-32 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">包含</SelectItem>
                      <SelectItem value="not_contains">不包含</SelectItem>
                      <SelectItem value="equals">等于</SelectItem>
                      <SelectItem value="not_equals">不等于</SelectItem>
                      <SelectItem value="starts_with">开头是</SelectItem>
                      <SelectItem value="ends_with">结尾是</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={condition.value}
                    onChange={(e) => {
                      setFilterGroups((groups) =>
                        groups.map((g) =>
                          g.id === group.id
                            ? {
                                ...g,
                                conditions: g.conditions.map((c) =>
                                  c.id === condition.id ? { ...c, value: e.target.value } : c
                                ),
                              }
                            : g
                        )
                      );
                    }}
                    placeholder="输入值"
                    className="flex-1 h-8 min-w-0"
                  />
                  {group.conditions.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setFilterGroups((groups) =>
                          groups.map((g) =>
                            g.id === group.id
                              ? { ...g, conditions: g.conditions.filter((c) => c.id !== condition.id) }
                              : g
                          )
                        );
                      }}
                      className="h-8 w-8 p-0 shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFilterGroups((groups) =>
                    groups.map((g) =>
                      g.id === group.id
                        ? {
                            ...g,
                            conditions: [
                              ...g.conditions,
                              {
                                id: `condition-${Date.now()}`,
                                columnKey: firstColumnKey,
                                operator: "contains",
                                value: "",
                              },
                            ],
                          }
                        : g
                    )
                  );
                }}
                className="ml-14 h-7"
              >
                <Plus className="h-3 w-3 mr-1" />
                添加条件
              </Button>
            </div>
          </div>
        ))
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <Button type="button" size="sm" variant="outline" onClick={handleAddFilterGroup}>
          <Plus className="h-4 w-4 mr-1" />
          添加筛选组
        </Button>
        {filterGroups.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setFilterGroups([])}>
            清除所有筛选
          </Button>
        )}
        <div className="ml-auto text-sm text-muted-foreground">
          显示 {filteredCount} / {totalCount} 条记录
        </div>
      </div>
    </div>
  );
}
