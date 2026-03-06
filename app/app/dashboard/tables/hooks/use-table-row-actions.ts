"use client";

import { useState, useCallback } from "react";
import type { TableRow as TableRowType } from "@/lib/api/multi-dimension-tables";
import type { TableColumn } from "@/lib/api/multi-dimension-tables";
import type { RecordHistoryOptions } from "./use-table-editor-history";
import type { RowRecordDialogMode } from "../components/row-record-dialog";
import type { RowConditionDialogMode } from "../components/row-condition-dialog";

export interface UseTableRowActionsParams {
  table: { id: string; columns: TableColumn[] } | null;
  localRows: TableRowType[];
  setLocalRows: React.Dispatch<React.SetStateAction<TableRowType[]>>;
  setHasUnsavedChanges: (value: boolean) => void;
  recordHistory: (rows: TableRowType[], columns: TableColumn[], options?: RecordHistoryOptions) => void;
  handleError: (error: unknown, message?: string) => void;
}

export function useTableRowActions({
  table,
  localRows,
  setLocalRows,
  setHasUnsavedChanges,
  recordHistory,
  handleError,
}: UseTableRowActionsParams) {
  const [rowRecordDialogOpen, setRowRecordDialogOpen] = useState(false);
  const [rowRecordDialogMode, setRowRecordDialogMode] = useState<RowRecordDialogMode>("add");
  const [rowRecordDialogRow, setRowRecordDialogRow] = useState<TableRowType | null>(null);

  const [rowConditionDialogOpen, setRowConditionDialogOpen] = useState(false);
  const [rowConditionDialogMode, setRowConditionDialogMode] =
    useState<RowConditionDialogMode>("edit_by_condition");
  const [rowQueryDialogOpen, setRowQueryDialogOpen] = useState(false);

  const handleCellChange = useCallback(
    (rowId: string, columnKey: string, value: string) => {
      if (!table) return;
      const row = localRows.find((r) => r.id === rowId);
      const displayId = row?.row_id ?? rowId;
      const oldValue = row?.cells?.[columnKey] ?? "";
      const newRows = localRows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [columnKey]: value } } : r
      );
      setLocalRows(newRows);
      setHasUnsavedChanges(true);
      const col = table.columns.find((c) => c.key === columnKey);
      const columnLabel = col?.label ?? columnKey;
      recordHistory(newRows, table.columns, {
        stepType: "update",
        stepTitle: `ID ${displayId} 的「${columnLabel}」字段发生修改`,
        stepDescription: `"${oldValue}" → "${value}"`,
        stepLabel: `更新 ID 为 ${displayId} 的数据的「${columnLabel}」字段`,
      });
    },
    [table, localRows, setLocalRows, setHasUnsavedChanges, recordHistory]
  );

  const handleOpenAddRecordDialog = useCallback(() => {
    setRowRecordDialogMode("add");
    setRowRecordDialogRow(null);
    setRowRecordDialogOpen(true);
  }, []);

  const handleOpenEditRecordDialog = useCallback((row: TableRowType) => {
    setRowRecordDialogMode("edit");
    setRowRecordDialogRow(row);
    setRowRecordDialogOpen(true);
  }, []);

  const handleOpenDeleteRecordDialog = useCallback((row: TableRowType) => {
    setRowRecordDialogMode("delete");
    setRowRecordDialogRow(row);
    setRowRecordDialogOpen(true);
  }, []);

  const handleRowRecordSubmit = useCallback(
    (mode: RowRecordDialogMode, cells?: Record<string, string>) => {
      if (!table) return;
      try {
        if (mode === "add" && cells) {
          const now = new Date().toISOString();
          const maxRowId =
            localRows.length > 0
              ? Math.max(
                  ...localRows.map((r) => (r.row_id != null && r.row_id >= 0 ? r.row_id : -1)),
                  -1
                )
              : -1;
          const nextRowId = maxRowId + 1;
          const newRow: TableRowType = {
            id: `temp-${Date.now()}`,
            table_id: table.id,
            row_id: nextRowId,
            cells: cells,
            created_at: now,
            updated_at: now,
          } as TableRowType;
          const newRows = [...localRows, newRow];
          setLocalRows(newRows);
          setHasUnsavedChanges(true);
          recordHistory(newRows, table.columns, {
            stepType: "add",
            stepTitle: "新增一行数据",
            stepDescription: `ID: 新行，字段数 ${Object.keys(cells).length}`,
            stepLabel: "新增一条记录",
          });
        } else if (mode === "edit" && rowRecordDialogRow && cells) {
          const target = rowRecordDialogRow;
          const displayId = target.row_id ?? target.id;
          const oldCells = target.cells || {};
          const mergedCells = { ...oldCells, ...cells };
          const newRows = localRows.map((row) =>
            row.id === target.id ? { ...row, cells: mergedCells } : row
          );
          setLocalRows(newRows);
          setHasUnsavedChanges(true);
          recordHistory(newRows, table.columns, {
            stepType: "update",
            stepTitle: `编辑 ID ${displayId} 的记录`,
            stepDescription: `修改字段数：${Object.keys(cells).length}`,
            stepLabel: `编辑 ID 为 ${displayId} 的记录`,
          });
        } else if (mode === "delete" && rowRecordDialogRow) {
          const target = rowRecordDialogRow;
          const displayId = target.row_id ?? target.id;
          const newRows = localRows.map((row) =>
            row.id === target.id ? { ...row, _deleted: true } : row
          );
          setLocalRows(newRows);
          setHasUnsavedChanges(true);
          recordHistory(newRows, table.columns, {
            stepType: "delete",
            stepTitle: `删除 ID ${displayId} 的记录`,
            stepDescription: "该行已标记为删除，保存后才会真正删除",
            stepLabel: `删除 ID 为 ${displayId} 的记录`,
          });
        }
      } catch (error) {
        handleError(
          error,
          mode === "add"
            ? "添加记录失败"
            : mode === "edit"
              ? "修改记录失败"
              : "删除记录失败"
        );
        throw error;
      }
    },
    [table, rowRecordDialogRow, localRows, setLocalRows, setHasUnsavedChanges, recordHistory, handleError]
  );

  const handleCreateRow = useCallback(() => {
    handleOpenAddRecordDialog();
  }, [handleOpenAddRecordDialog]);

  const handleDeleteRow = useCallback(
    (row: TableRowType) => {
      handleOpenDeleteRecordDialog(row);
    },
    [handleOpenDeleteRecordDialog]
  );

  const handleOpenEditByConditionDialog = useCallback(() => {
    setRowConditionDialogMode("edit_by_condition");
    setRowConditionDialogOpen(true);
  }, []);

  const handleOpenDeleteByConditionDialog = useCallback(() => {
    setRowConditionDialogMode("delete_by_condition");
    setRowConditionDialogOpen(true);
  }, []);

  const handleOpenQueryByConditionDialog = useCallback(() => {
    setRowQueryDialogOpen(true);
  }, []);

  const handleRowConditionSubmit = useCallback(
    (
      mode: RowConditionDialogMode,
      condition: { column_key: string; value: string },
      cells?: Record<string, string>
    ) => {
      if (!table) return;
      const matchRow = (row: TableRowType): boolean => {
        if (condition.column_key === "row_id") {
          return String(row.row_id) === String(condition.value);
        }
        return String(row.cells?.[condition.column_key] ?? "") === String(condition.value);
      };
      try {
        if (mode === "edit_by_condition" && cells) {
          let affected = 0;
          const newRows = localRows.map((row) => {
            if (!matchRow(row)) return row;
            affected += 1;
            return { ...row, cells: { ...row.cells, ...cells } };
          });
          if (affected === 0) return;
          setLocalRows(newRows);
          setHasUnsavedChanges(true);
          recordHistory(newRows, table.columns, {
            stepType: "update",
            stepTitle: "按条件编辑记录",
            stepDescription: `条件：${condition.column_key} = ${condition.value}，影响 ${affected} 行`,
            stepLabel: "按条件编辑记录",
          });
        } else if (mode === "delete_by_condition") {
          let affected = 0;
          const newRows = localRows.map((row) => {
            if (!matchRow(row)) return row;
            affected += 1;
            return { ...row, _deleted: true };
          });
          if (affected === 0) return;
          setLocalRows(newRows);
          setHasUnsavedChanges(true);
          recordHistory(newRows, table.columns, {
            stepType: "delete",
            stepTitle: "按条件删除记录",
            stepDescription: `条件：${condition.column_key} = ${condition.value}，标记删除 ${affected} 行（保存后生效）`,
            stepLabel: "按条件删除记录",
          });
        }
      } catch (error) {
        handleError(
          error,
          mode === "edit_by_condition" ? "按条件编辑失败" : "按条件删除失败"
        );
        throw error;
      }
    },
    [table, localRows, setLocalRows, setHasUnsavedChanges, recordHistory, handleError]
  );

  return {
    rowRecordDialogOpen,
    setRowRecordDialogOpen,
    rowRecordDialogMode,
    setRowRecordDialogMode,
    rowRecordDialogRow,
    setRowRecordDialogRow,
    rowConditionDialogOpen,
    setRowConditionDialogOpen,
    rowConditionDialogMode,
    setRowConditionDialogMode,
    rowQueryDialogOpen,
    setRowQueryDialogOpen,
    handleCellChange,
    handleOpenAddRecordDialog,
    handleOpenEditRecordDialog,
    handleOpenDeleteRecordDialog,
    handleRowRecordSubmit,
    handleCreateRow,
    handleDeleteRow,
    handleOpenEditByConditionDialog,
    handleOpenDeleteByConditionDialog,
    handleOpenQueryByConditionDialog,
    handleRowConditionSubmit,
  };
}
