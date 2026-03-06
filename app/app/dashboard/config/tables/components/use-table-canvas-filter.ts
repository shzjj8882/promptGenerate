/**
 * TableCanvas 筛选逻辑：条件判断与过滤行
 */
import { useState, useCallback, useMemo } from "react";
import type { TableRow as TableRowType } from "@/lib/api/multi-dimension-tables";
import type { FilterCondition, FilterGroup } from "./table-canvas-types";
import { filterNonDeletedRows } from "@/lib/utils/table-rows";

export function useTableCanvasFilter(rows: TableRowType[]) {
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([]);

  const checkCondition = useCallback((row: TableRowType, condition: FilterCondition): boolean => {
    const cellValue = String(row.cells[condition.columnKey] ?? "").toLowerCase();
    const filterValue = condition.value.toLowerCase();
    if (!filterValue.trim()) return true;
    switch (condition.operator) {
      case "contains":
        return cellValue.includes(filterValue);
      case "not_contains":
        return !cellValue.includes(filterValue);
      case "equals":
        return cellValue === filterValue;
      case "not_equals":
        return cellValue !== filterValue;
      case "starts_with":
        return cellValue.startsWith(filterValue);
      case "ends_with":
        return cellValue.endsWith(filterValue);
      default:
        return true;
    }
  }, []);

  const checkGroup = useCallback(
    (row: TableRowType, group: FilterGroup): boolean => {
      if (group.conditions.length === 0) return true;
      const validConditions = group.conditions.filter((c) => c.value.trim());
      if (validConditions.length === 0) return true;
      if (group.logic === "and")
        return validConditions.every((condition) => checkCondition(row, condition));
      return validConditions.some((condition) => checkCondition(row, condition));
    },
    [checkCondition]
  );

  const applyFilter = useCallback(
    (row: TableRowType, groups: FilterGroup[]): boolean => {
      if (groups.length === 0) return true;
      let result = checkGroup(row, groups[0]);
      for (let i = 1; i < groups.length; i++) {
        const groupResult = checkGroup(row, groups[i]);
        const groupLogic = groups[i].groupLogic ?? "and";
        result = groupLogic === "and" ? result && groupResult : result || groupResult;
      }
      return result;
    },
    [checkGroup]
  );

  const filteredRows = useMemo(
    () => filterNonDeletedRows(rows).filter((row) => applyFilter(row, filterGroups)),
    [rows, filterGroups, applyFilter]
  );

  return {
    filterGroups,
    setFilterGroups,
    checkCondition,
    checkGroup,
    applyFilter,
    filteredRows,
  };
}
