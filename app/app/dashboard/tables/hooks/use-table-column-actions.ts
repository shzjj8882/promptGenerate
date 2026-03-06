"use client";

import { useState, useCallback } from "react";
import type { MultiDimensionTable } from "@/lib/api/multi-dimension-tables";
import type { TableRow as TableRowType, TableColumn, TableColumnOptions } from "@/lib/api/multi-dimension-tables";
import type { RecordHistoryOptions } from "./use-table-editor-history";
import {
  addColumnFormSchema,
  editColumnFormSchema,
  firstSchemaErrorMessage,
} from "../table-editor-column-schema";

export interface UseTableColumnActionsParams {
  table: MultiDimensionTable | null;
  setTable: React.Dispatch<React.SetStateAction<MultiDimensionTable | null>>;
  localRows: TableRowType[];
  setLocalRows: React.Dispatch<React.SetStateAction<TableRowType[]>>;
  setHasUnsavedChanges: (value: boolean) => void;
  recordHistory: (rows: TableRowType[], columns: TableColumn[], options?: RecordHistoryOptions) => void;
  handleError: (error: unknown, message?: string) => void;
}

export function useTableColumnActions({
  table,
  setTable,
  localRows,
  setLocalRows,
  setHasUnsavedChanges,
  recordHistory,
  handleError,
}: UseTableColumnActionsParams) {
  const [isAddColumnDialogOpen, setIsAddColumnDialogOpen] = useState(false);
  const [addColumnInsertPosition, setAddColumnInsertPosition] = useState<{
    side: "left" | "right";
    columnKey: string;
  } | null>(null);
  const [addColumnCopyFromKey, setAddColumnCopyFromKey] = useState<string | null>(null);
  const [newColumnKey, setNewColumnKey] = useState("");
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [newColumnType, setNewColumnType] = useState<string>("text");
  const [newColumnOptions, setNewColumnOptions] = useState<Array<{ key: string; value: string }>>([]);
  const [newColumnDateFormat, setNewColumnDateFormat] = useState<string>("YYYY/MM/DD");
  const [newColumnDefaultValue, setNewColumnDefaultValue] = useState<string>("");

  const [isEditColumnDialogOpen, setIsEditColumnDialogOpen] = useState(false);
  const [editingColumnKey, setEditingColumnKey] = useState<string>("");
  const [editingColumnLabel, setEditingColumnLabel] = useState("");
  const [editingColumnType, setEditingColumnType] = useState<string>("text");
  const [editingColumnOptions, setEditingColumnOptions] = useState<Array<{ key: string; value: string }>>([]);
  const [editingColumnDateFormat, setEditingColumnDateFormat] = useState<string>("YYYY/MM/DD");
  const [editingColumnDefaultValue, setEditingColumnDefaultValue] = useState<string>("");

  const makeNewColumnKey = useCallback(() => {
    const base = `col_${Date.now()}`;
    if (!table) return base;
    let key = base;
    let n = 0;
    while (table.columns.some((c) => c.key === key)) key = `${base}_${++n}`;
    return key;
  }, [table]);

  const handleAddColumn = useCallback(() => {
    setAddColumnInsertPosition(null);
    setAddColumnCopyFromKey(null);
    setNewColumnKey("");
    setNewColumnLabel("");
    setNewColumnType("text");
    setNewColumnOptions([]);
    setNewColumnDateFormat("YYYY/MM/DD");
    setNewColumnDefaultValue("");
    setIsAddColumnDialogOpen(true);
  }, []);

  const handleSaveColumn = useCallback(() => {
    if (!table) return;
    const parseResult = addColumnFormSchema.safeParse({
      columnKey: newColumnKey,
      label: newColumnLabel,
      type: newColumnType,
      options: newColumnOptions,
      dateFormat: newColumnDateFormat,
      defaultValue: newColumnDefaultValue,
    });
    if (!parseResult.success) {
      handleError(new Error(firstSchemaErrorMessage(parseResult)), firstSchemaErrorMessage(parseResult));
      return;
    }
    const data = parseResult.data;
    if (table.columns.some((col) => col.key === data.columnKey.trim())) {
      handleError(new Error("列 key 已存在"), "列 key 不能重复");
      return;
    }

    const newColumn: TableColumn = {
      key: data.columnKey.trim(),
      label: data.label.trim(),
      type: data.type,
    };
    const columnOptions: TableColumnOptions = {};
    if (data.type === "single_select" || data.type === "multi_select") {
      const validOptions = data.options.filter((o) => o.value.trim());
      columnOptions.options = validOptions.map((o) => o.value.trim());
    }
    if (data.type === "date") columnOptions.format = data.dateFormat;
    if (data.defaultValue.trim()) columnOptions.defaultValue = data.defaultValue.trim();
    if (Object.keys(columnOptions).length > 0) newColumn.options = columnOptions;

    let updatedColumns: TableColumn[];
    if (addColumnInsertPosition) {
      const idx = table.columns.findIndex((c) => c.key === addColumnInsertPosition.columnKey);
      if (idx < 0) {
        updatedColumns = [...table.columns, newColumn];
      } else {
        updatedColumns = [...table.columns];
        updatedColumns.splice(addColumnInsertPosition.side === "left" ? idx : idx + 1, 0, newColumn);
      }
    } else {
      updatedColumns = [...table.columns, newColumn];
    }

    const defaultValue = newColumn.options?.defaultValue || "";
    const copyFromKey = addColumnCopyFromKey;
    const newRows = localRows.map((row) => ({
      ...row,
      cells: {
        ...row.cells,
        [newColumn.key]: copyFromKey != null ? (row.cells[copyFromKey] ?? "") : defaultValue,
      },
    }));

    setTable({ ...table, columns: updatedColumns });
    setLocalRows(newRows);
    setHasUnsavedChanges(true);
    recordHistory(newRows, updatedColumns, {
      stepType: "add",
      stepTitle: "新增列",
      stepDescription: `key: ${newColumn.key}，名称: ${newColumn.label}，类型: ${newColumn.type}`,
      stepLabel: `新增 key 为 ${newColumn.key} 的列「${newColumn.label}」`,
    });
    setIsAddColumnDialogOpen(false);
    setAddColumnInsertPosition(null);
    setAddColumnCopyFromKey(null);
    setNewColumnKey("");
    setNewColumnLabel("");
    setNewColumnType("text");
  }, [
    table,
    newColumnKey,
    newColumnLabel,
    newColumnType,
    newColumnOptions,
    newColumnDateFormat,
    newColumnDefaultValue,
    addColumnInsertPosition,
    addColumnCopyFromKey,
    localRows,
    setTable,
    setLocalRows,
    setHasUnsavedChanges,
    recordHistory,
    handleError,
  ]);

  const handleDeleteColumn = useCallback(
    (columnKey: string) => {
      if (!table) return;
      const col = table.columns.find((c) => c.key === columnKey);
      const columnLabel = col?.label ?? columnKey;
      const updatedColumns = table.columns.filter((c) => c.key !== columnKey);
      const newRows = localRows.map((row) => {
        const newCells = { ...row.cells };
        delete newCells[columnKey];
        return { ...row, cells: newCells };
      });
      setTable({ ...table, columns: updatedColumns });
      setLocalRows(newRows);
      setHasUnsavedChanges(true);
      recordHistory(newRows, updatedColumns, {
        stepType: "delete",
        stepTitle: "删除列",
        stepDescription: `已移除 key: ${columnKey}，列名「${columnLabel}」`,
        stepLabel: `删除 key 为 ${columnKey} 的列「${columnLabel}」`,
      });
    },
    [table, localRows, setTable, setLocalRows, setHasUnsavedChanges, recordHistory]
  );

  const handleReorderColumns = useCallback(
    (columnKeys: string[]) => {
      if (!table) return;
      const newColumns = columnKeys
        .map((k) => table.columns.find((c) => c.key === k))
        .filter((c): c is TableColumn => !!c);
      if (newColumns.length !== table.columns.length) return;
      setTable({ ...table, columns: newColumns });
      setHasUnsavedChanges(true);
      const prevOrder = table.columns.map((c) => c.key).join("、");
      const nextOrder = newColumns.map((c) => c.key).join("、");
      recordHistory(localRows, newColumns, {
        stepType: "reorder",
        stepTitle: "调整列顺序",
        stepDescription: `${prevOrder} → ${nextOrder}`,
        stepLabel: "调整列顺序",
      });
    },
    [table, localRows, setTable, setHasUnsavedChanges, recordHistory]
  );

  const handleInsertColumnLeft = useCallback(
    (columnKey: string) => {
      if (!table?.columns?.some((c) => c.key === columnKey)) return;
      setAddColumnInsertPosition({ side: "left", columnKey });
      setNewColumnKey("");
      setNewColumnLabel("");
      setNewColumnType("text");
      setNewColumnOptions([]);
      setNewColumnDateFormat("YYYY/MM/DD");
      setNewColumnDefaultValue("");
      setIsAddColumnDialogOpen(true);
    },
    [table?.columns]
  );

  const handleInsertColumnRight = useCallback(
    (columnKey: string) => {
      if (!table?.columns?.some((c) => c.key === columnKey)) return;
      setAddColumnInsertPosition({ side: "right", columnKey });
      setNewColumnKey("");
      setNewColumnLabel("");
      setNewColumnType("text");
      setNewColumnOptions([]);
      setNewColumnDateFormat("YYYY/MM/DD");
      setNewColumnDefaultValue("");
      setIsAddColumnDialogOpen(true);
    },
    [table?.columns]
  );

  const handleCopyColumn = useCallback(
    (columnKey: string) => {
      if (!table) return;
      const col = table.columns.find((c) => c.key === columnKey);
      if (!col) return;
      setAddColumnInsertPosition(null);
      setAddColumnCopyFromKey(columnKey);
      setNewColumnKey(makeNewColumnKey());
      setNewColumnLabel(`${col.label} (副本)`);
      setNewColumnType(col.type || "text");
      if (col.type === "single_select" || col.type === "multi_select") {
        const options = col.options?.options || [];
        setNewColumnOptions(options.map((opt: string) => ({ key: opt, value: opt })));
      } else {
        setNewColumnOptions([]);
      }
      if (col.type === "date") {
        setNewColumnDateFormat(col.options?.format || "YYYY/MM/DD");
      } else {
        setNewColumnDateFormat("YYYY/MM/DD");
      }
      setNewColumnDefaultValue(col.options?.defaultValue || "");
      setIsAddColumnDialogOpen(true);
    },
    [table, makeNewColumnKey]
  );

  const handleEditColumn = useCallback(
    (columnKey: string) => {
      const column = table?.columns.find((c) => c.key === columnKey);
      if (!column) return;
      setEditingColumnKey(column.key);
      setEditingColumnLabel(column.label);
      setEditingColumnType(column.type || "text");
      if (column.type === "single_select" || column.type === "multi_select") {
        const options = column.options?.options || [];
        setEditingColumnOptions(options.map((opt: string) => ({ key: opt, value: opt })));
      } else {
        setEditingColumnOptions([]);
      }
      if (column.type === "date") {
        setEditingColumnDateFormat(column.options?.format || "YYYY/MM/DD");
      } else {
        setEditingColumnDateFormat("YYYY/MM/DD");
      }
      setEditingColumnDefaultValue(column.options?.defaultValue || "");
      setIsEditColumnDialogOpen(true);
    },
    [table?.columns]
  );

  const handleSaveEditColumn = useCallback(() => {
    if (!table) return;
    const parseResult = editColumnFormSchema.safeParse({
      label: editingColumnLabel,
      type: editingColumnType,
      options: editingColumnOptions,
      dateFormat: editingColumnDateFormat,
      defaultValue: editingColumnDefaultValue,
    });
    if (!parseResult.success) {
      handleError(new Error(firstSchemaErrorMessage(parseResult)), firstSchemaErrorMessage(parseResult));
      return;
    }
    const data = parseResult.data;

    const updatedColumns = table.columns.map((col) => {
      if (col.key !== editingColumnKey) return col;
      const updatedCol: TableColumn = {
        ...col,
        label: data.label.trim(),
        type: data.type,
      };
      const columnOptions: TableColumnOptions = {};
      if (data.type === "single_select" || data.type === "multi_select") {
        const validOptions = data.options.filter((o) => o.value.trim());
        columnOptions.options = validOptions.map((o) => o.value.trim());
      }
      if (data.type === "date") columnOptions.format = data.dateFormat;
      if (data.defaultValue.trim()) columnOptions.defaultValue = data.defaultValue.trim();
      if (Object.keys(columnOptions).length > 0) updatedCol.options = columnOptions;
      else delete updatedCol.options;
      return updatedCol;
    });

    setTable({ ...table, columns: updatedColumns });
    setHasUnsavedChanges(true);
    const oldCol = table.columns.find((c) => c.key === editingColumnKey);
    const colLabel = oldCol?.label ?? editingColumnKey;
    const oldLabel = oldCol?.label ?? "";
    const oldType = oldCol?.type ?? "text";
    const oldDefault = oldCol?.options?.defaultValue ?? "";
    const newLabel = data.label.trim();
    const newDefault = data.defaultValue.trim();
    const descParts: string[] = [];
    if (oldLabel !== newLabel) descParts.push(`名称 "${oldLabel}" → "${newLabel}"`);
    if (oldType !== data.type) descParts.push(`类型 ${oldType} → ${data.type}`);
    if (oldDefault !== newDefault) descParts.push(`默认值 "${oldDefault}" → "${newDefault}"`);
    if (descParts.length === 0) descParts.push("列信息已更新");
    recordHistory(localRows, updatedColumns, {
      stepType: "update",
      stepTitle: `列「${colLabel}」信息发生修改`,
      stepDescription: descParts.join("；"),
      stepLabel: `更新 key 为 ${editingColumnKey} 的列「${colLabel}」信息（名称/数据类型/默认值）`,
    });
    setIsEditColumnDialogOpen(false);
    setEditingColumnKey("");
    setEditingColumnLabel("");
    setEditingColumnType("text");
    setEditingColumnOptions([]);
    setEditingColumnDateFormat("YYYY/MM/DD");
    setEditingColumnDefaultValue("");
  }, [
    table,
    editingColumnKey,
    editingColumnLabel,
    editingColumnType,
    editingColumnOptions,
    editingColumnDateFormat,
    editingColumnDefaultValue,
    localRows,
    setTable,
    setHasUnsavedChanges,
    recordHistory,
    handleError,
  ]);

  return {
    isAddColumnDialogOpen,
    setIsAddColumnDialogOpen,
    addColumnInsertPosition,
    setAddColumnInsertPosition,
    addColumnCopyFromKey,
    setAddColumnCopyFromKey,
    newColumnKey,
    setNewColumnKey,
    newColumnLabel,
    setNewColumnLabel,
    newColumnType,
    setNewColumnType,
    newColumnOptions,
    setNewColumnOptions,
    newColumnDateFormat,
    setNewColumnDateFormat,
    newColumnDefaultValue,
    setNewColumnDefaultValue,
    isEditColumnDialogOpen,
    setIsEditColumnDialogOpen,
    editingColumnKey,
    setEditingColumnKey,
    editingColumnLabel,
    setEditingColumnLabel,
    editingColumnType,
    setEditingColumnType,
    editingColumnOptions,
    setEditingColumnOptions,
    editingColumnDateFormat,
    setEditingColumnDateFormat,
    editingColumnDefaultValue,
    setEditingColumnDefaultValue,
    makeNewColumnKey,
    handleAddColumn,
    handleSaveColumn,
    handleDeleteColumn,
    handleReorderColumns,
    handleInsertColumnLeft,
    handleInsertColumnRight,
    handleCopyColumn,
    handleEditColumn,
    handleSaveEditColumn,
  };
}
