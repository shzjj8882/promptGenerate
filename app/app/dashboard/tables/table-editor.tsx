"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useCallback, useRef } from "react";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { History, LayoutGrid } from "@/components/icons";
import {
  loadHiddenColumnsFromStorage,
  saveHiddenColumnsToStorage,
} from "@/app/dashboard/config/tables/components/table-canvas-constants";
import {
  getTable,
  updateTable,
  type MultiDimensionTable,
  type TableRow as TableRowType,
  type TableColumn,
  type TableRowBulkData,
  getTableCompletedHistory,
  type CompletedHistoryApiEntry,
} from "@/lib/api/multi-dimension-tables";
import { filterNonDeletedRows } from "@/lib/utils/table-rows";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useUndoRedoShortcuts } from "@/hooks/use-undo-redo-shortcuts";
const TableCanvasView = dynamic(
  () =>
    import("@/app/dashboard/config/tables/components/table-canvas-view").then((m) => ({
      default: m.TableCanvasView,
    })),
  { ssr: false }
);
import { RowRecordDialog } from "./components/row-record-dialog";
import { RowConditionDialog } from "./components/row-condition-dialog";
import { RowQueryDialog } from "./components/row-query-dialog";
import { TableEditorHistorySidebar } from "./components/table-editor-history-sidebar";
import { TableEditorAddColumnDialog } from "./components/table-editor-add-column-dialog";
import { TableEditorEditColumnDialog } from "./components/table-editor-edit-column-dialog";
import { TableEditorColumnVisibilitySheet } from "./components/table-editor-column-visibility-sheet";
import type { HistoryState, CompletedHistoryEntry } from "./table-editor-types";
import { useTableEditorHistory } from "./hooks/use-table-editor-history";
import { useTableColumnActions } from "./hooks/use-table-column-actions";
import { useTableRowActions } from "./hooks/use-table-row-actions";

interface TableEditorProps {
  tableId: string;
  onTableUpdated?: () => void;
  initialTable?: MultiDimensionTable;
  initialRows?: TableRowType[];
}

function TableEditorImpl({ tableId, onTableUpdated, initialTable, initialRows }: TableEditorProps) {
  const [table, setTable] = useState<MultiDimensionTable | null>(initialTable || null);
  const [loading, setLoading] = useState(!initialTable);
  const [loadingRows, setLoadingRows] = useState(false);
  const [localRows, setLocalRows] = useState<TableRowType[]>(initialRows || []);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [historySidebarOpen, setHistorySidebarOpen] = useState(false);
  const [historySidebarTab, setHistorySidebarTab] = useState<"session" | "completed">("session");
  const [completedHistory, setCompletedHistory] = useState<CompletedHistoryEntry[]>([]);
  const completedHistoryFetchedForTableIdRef = useRef<string | null>(null);

  /** 隐藏列（仅前端展示，存 localStorage，按 tableId 区分） */
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<string[]>([]);
  const [columnVisibilitySheetOpen, setColumnVisibilitySheetOpen] = useState(false);

  const { handleError } = useErrorHandler({
    showToast: true,
  });
  /** 供 hooks 使用：hook 的 message 为可选，此处补默认值以匹配 useErrorHandler 的签名 */
  const handleErrorForHooks = useCallback(
    (error: unknown, message?: string) => {
      handleError(error, message ?? "操作失败");
    },
    [handleError]
  );

  const {
    history,
    setHistory,
    historyIndex,
    setHistoryIndex,
    historyIndexRef,
    historyInitializedRef,
    recordHistory,
    handleUndo,
    handleRedo,
    handleRollbackToHistoryIndex,
    handleRollbackToCompleted,
    initializeHistory,
  } = useTableEditorHistory({
    table,
    setTable,
    setLocalRows,
    setHasUnsavedChanges,
    onRollback: () => setHistorySidebarOpen(false),
  });

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex, historyIndexRef]);

  const {
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
    handleAddColumn,
    handleSaveColumn,
    handleDeleteColumn,
    handleReorderColumns,
    handleInsertColumnLeft,
    handleInsertColumnRight,
    handleCopyColumn,
    handleEditColumn,
    handleSaveEditColumn,
  } = useTableColumnActions({
    table,
    setTable,
    localRows,
    setLocalRows,
    setHasUnsavedChanges,
    recordHistory,
    handleError: handleErrorForHooks,
  });

  const {
    rowRecordDialogOpen,
    setRowRecordDialogOpen,
    rowRecordDialogMode,
    rowRecordDialogRow,
    rowConditionDialogOpen,
    setRowConditionDialogOpen,
    rowConditionDialogMode,
    rowQueryDialogOpen,
    setRowQueryDialogOpen,
    handleCellChange,
    handleOpenEditRecordDialog,
    handleRowRecordSubmit,
    handleCreateRow,
    handleDeleteRow,
    handleOpenEditByConditionDialog,
    handleOpenDeleteByConditionDialog,
    handleOpenQueryByConditionDialog,
    handleRowConditionSubmit,
  } = useTableRowActions({
    table,
    localRows,
    setLocalRows,
    setHasUnsavedChanges,
    recordHistory,
    handleError: handleErrorForHooks,
  });

  const fetchTableRows = useCallback(async (tableId: string, options?: { resetHistory?: boolean }) => {
    if (!tableId) return;
    try {
      setLoadingRows(true);
      const tableData = await getTable(tableId, true);
      const data = tableData.rows || [];
      setLocalRows(data);
      setHasUnsavedChanges(false);
      // 编辑后刷新时同步更新 table 对象，确保列定义等元数据一致
      setTable((prev) => (prev ? { ...prev, ...tableData, rows: data } : prev));
      if (options?.resetHistory) {
        initializeHistory(data, tableData.columns || []);
      }
    } catch (error) {
      handleError(error, "加载表格行数据失败");
    } finally {
      setLoadingRows(false);
    }
  }, [handleError, initializeHistory]);

  const mapApiHistoryToEntry = useCallback((api: CompletedHistoryApiEntry): CompletedHistoryEntry => {
    const timestamp = api.created_at ? new Date(api.created_at).getTime() : Date.now();
    const dateKey = api.created_at ? api.created_at.slice(0, 10) : new Date(timestamp).toISOString().slice(0, 10);
    const snapshot: HistoryState = {
      rows: api.snapshot.rows,
      columns: api.snapshot.columns,
      stepLabel: api.snapshot.stepLabel,
      stepType: api.snapshot.stepType as any,
      stepTitle: api.snapshot.stepTitle,
      stepDescription: api.snapshot.stepDescription,
    };
    return {
      id: api.id,
      dateKey,
      timestamp,
      snapshot,
      label: api.label,
    };
  }, []);

  const fetchCompletedHistory = useCallback(
    async (tableIdToLoad: string) => {
      try {
        const items = await getTableCompletedHistory(tableIdToLoad, 100);
        setCompletedHistory(items.map(mapApiHistoryToEntry));
      } catch (error) {
        // 历史记录加载失败不影响主流程
        console.error("加载已完成历史记录失败", error);
      }
    },
    [mapApiHistoryToEntry]
  );

  const fetchTableData = useCallback(async () => {
    if (!tableId) return;
    try {
      setLoading(true);
      // 一次性获取表格信息和行数据
      const tableData = await getTable(tableId, true);
      setTable(tableData);
      const rowsData = tableData.rows || [];
      setLocalRows(rowsData);
      initializeHistory(rowsData, tableData.columns || []);
      setHasUnsavedChanges(false);
    } catch (error) {
      handleError(error, "加载表格失败");
    } finally {
      setLoading(false);
    }
  }, [tableId, handleError, initializeHistory]);

  // 初始化：如果有初始数据，直接使用；否则从服务端获取
  useEffect(() => {
    const effectiveTableId = initialTable?.id ?? tableId;
    if (effectiveTableId && completedHistoryFetchedForTableIdRef.current !== effectiveTableId) {
      completedHistoryFetchedForTableIdRef.current = effectiveTableId;
      fetchCompletedHistory(effectiveTableId);
    }
    if (initialTable && initialRows) {
      if (!table || table.id !== initialTable.id) {
        setTable(initialTable);
        setLocalRows(initialRows);
        initializeHistory(initialRows, initialTable.columns || []);
        setHasUnsavedChanges(false);
        setLoading(false);
      } else if (history.length === 0 || historyIndex < 0) {
        initializeHistory(initialRows, initialTable.columns || []);
      }
    } else if (!table && tableId) {
      fetchTableData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, initialTable?.id, table?.id, history.length, historyIndex]);

  // 隐藏列：从 localStorage 恢复（仅当表格已加载且列存在时）
  useEffect(() => {
    if (!table?.id || !table?.columns?.length) return;
    const saved = loadHiddenColumnsFromStorage(table.id);
    if (!saved?.length) return;
    const validKeys = saved.filter((k) => table.columns.some((c) => c.key === k));
    if (validKeys.length > 0) setHiddenColumnKeys(validKeys);
  }, [table?.id, table?.columns?.length]);

  const handleHiddenColumnKeysChange = useCallback(
    (keys: string[]) => {
      setHiddenColumnKeys(keys);
      if (table?.id) saveHiddenColumnsToStorage(table.id, keys);
    },
    [table?.id]
  );

  useUndoRedoShortcuts({
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    disabled: saving,
    onUndo: handleUndo,
    onRedo: handleRedo,
  });

  // 保存所有更改到后端
  const handleSave = async () => {
    if (!table || !hasUnsavedChanges) return;
    
    try {
      setSaving(true);
      
      // 准备批量保存的数据（全量保存，排除已标记删除的行）
      // 保留已存在行的 row_id，只对新行自动生成 row_id
      const rowsToSave: TableRowBulkData[] = filterNonDeletedRows(localRows)
        .map(row => {
          const rowData: TableRowBulkData = {
            cells: row.cells,
          };
          
          if (row.row_data) {
            rowData.row_data = row.row_data;
          }
          
          // 如果是已存在的行（不是临时行），保留其 row_id
          // 临时行（id 以 temp- 开头）不提供 row_id，让后端自动生成
          if (!row.id.startsWith("temp-") && row.row_id >= 0) {
            rowData.row_id = row.row_id;
            rowData.id = row.id; // 提供 id 用于更新
          }
          // 临时行不提供 row_id 和 id，让后端自动生成
          
          return rowData;
        });
      
      // 一次性更新表格和行数据（合并为一个 API 调用）
      const updatedTable = await updateTable(table.id, {
        columns: table.columns,
        rows: rowsToSave,
        deleted_row_ids: [], // 全量保存不需要单独删除，后端会删除所有旧行
      });
      
      // 从响应中获取保存后的行数据
      const savedRows = updatedTable.rows || [];
      
      // 更新本地状态（包括 table 对象和行数据）
      setTable({
        ...table,
        columns: updatedTable.columns || table.columns,
      });
      setLocalRows(savedRows);
      setHasUnsavedChanges(false);

      const newInitialState: HistoryState = {
        rows: JSON.parse(JSON.stringify(savedRows)),
        columns: JSON.parse(JSON.stringify(updatedTable.columns || table.columns)),
      };
      // 写入「已完成操作」历史
      const now = Date.now();
      const dateKey = new Date(now).toISOString().slice(0, 10);
      setCompletedHistory((prev) => [
        ...prev,
        { id: `save-${now}`, dateKey, timestamp: now, snapshot: { ...newInitialState }, label: "保存数据" },
      ]);
      // 重置本次会话历史
      setHistory([newInitialState]);
      setHistoryIndex(0);
      historyIndexRef.current = 0;
      historyInitializedRef.current = true;

      onTableUpdated?.();
    } catch (error) {
      handleError(error, "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 处理 Excel 导入时创建新列
  const handleImportColumns = useCallback((newColumns: Array<{ key: string; label: string; type?: string; defaultValue?: string }>, mode: "append" | "replace" = "append") => {
    if (!table) return;
    
    if (mode === "replace") {
      // 替换模式：用导入的列替换所有现有列
      const tableColumns: TableColumn[] = newColumns.map(col => ({
        key: col.key,
        label: col.label,
        type: col.type || "text",
        options: col.defaultValue ? { defaultValue: col.defaultValue } : undefined,
      }));
      
      // 更新表格列定义（完全替换）
      setTable({
        ...table,
        columns: tableColumns,
      });
      
      // 标记为有未保存的更改
      setHasUnsavedChanges(true);
      // 注意：这里不更新 localRows，因为数据行的更新会在 handleImportRows 中处理
    } else {
      // 追加模式：只添加新列
      // 过滤掉已存在的列（避免重复创建）
      const columnsToAdd = newColumns.filter(newCol => 
        !table.columns.some(existingCol => existingCol.key === newCol.key)
      );
      
      if (columnsToAdd.length === 0) {
        return; // 没有需要添加的新列
      }
      
      // 将新列转换为TableColumn格式
      const tableColumns: TableColumn[] = columnsToAdd.map(col => ({
        key: col.key,
        label: col.label,
        type: col.type || "text",
        options: col.defaultValue ? { defaultValue: col.defaultValue } : undefined,
      }));
      
      // 添加新列到表格定义
      const updatedColumns = [...table.columns, ...tableColumns];
      
      // 为所有现有行添加新列的值（使用空字符串）
      const newRows = localRows.map(row => {
        const newCells: Record<string, string> = { ...row.cells };
        tableColumns.forEach(col => {
          if (!(col.key in newCells)) {
            newCells[col.key] = ""; // 默认值为空字符串
          }
        });
        return {
          ...row,
          cells: newCells,
        };
      });
      
      // 更新本地表格状态
      setTable({
        ...table,
        columns: updatedColumns,
      });
      setLocalRows(newRows);
      setHasUnsavedChanges(true);
      const addedLabels = tableColumns.map((c) => `key 为 ${c.key} 的列「${c.label}」`).join("、");
      recordHistory(newRows, updatedColumns, {
        stepType: "add",
        stepTitle: "新增列",
        stepDescription: addedLabels,
        stepLabel: `新增 ${addedLabels}`,
      });
    }
  }, [table, localRows, recordHistory]);

  // 处理 Excel 导入
  const handleImportRows = useCallback((importedRows: TableRowType[], mode: "append" | "replace" = "append") => {
    if (!table) return;
    let newRows: TableRowType[];
    if (mode === "replace") {
      newRows = importedRows;
    } else {
      newRows = [...localRows, ...importedRows];
    }
    setLocalRows(newRows);
    setHasUnsavedChanges(true);
    const modeText = mode === "replace" ? "替换" : "追加";
    recordHistory(newRows, table.columns, {
      stepType: "import",
      stepTitle: "导入数据",
      stepDescription: `${modeText}，共 ${newRows.length} 条`,
      stepLabel: `导入数据（${modeText}）`,
    });
  }, [table, localRows, recordHistory]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">加载中...</div>
      </div>
    );
  }

  // 监听用户关闭 Tab / 刷新 / 直接离开页面时的未保存提醒
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  if (!table) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">表格不存在</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden min-h-0 min-w-0">
      <div className="rounded-lg border bg-card flex flex-col overflow-hidden flex-1 min-h-0 min-w-0">
        <TableCanvasView
          table={table}
          rows={localRows}
          loading={loadingRows}
          onCellChange={handleCellChange}
          onAddRow={handleCreateRow}
          onAddColumn={handleAddColumn}
          onDeleteColumn={handleDeleteColumn}
          onEditColumn={handleEditColumn}
          onInsertColumnLeft={handleInsertColumnLeft}
          onInsertColumnRight={handleInsertColumnRight}
          onCopyColumn={handleCopyColumn}
          onEditRow={handleOpenEditRecordDialog}
          onDeleteRow={handleDeleteRow}
          onEditByCondition={handleOpenEditByConditionDialog}
          onDeleteByCondition={handleOpenDeleteByConditionDialog}
          onQueryByCondition={handleOpenQueryByConditionDialog}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onSave={handleSave}
          saving={saving}
          hasUnsavedChanges={hasUnsavedChanges}
          onImportRows={handleImportRows}
          onImportColumns={handleImportColumns}
          onReorderColumns={handleReorderColumns}
          hiddenColumnKeys={hiddenColumnKeys.length > 0 ? hiddenColumnKeys : undefined}
          toolbarExtraLeftOfSave={
            <>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setColumnVisibilitySheetOpen(true)}
                className="shrink-0"
                title="设置列"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setHistorySidebarOpen(true)}
                className="shrink-0"
                title="历史记录"
              >
                <History className="h-4 w-4" />
              </Button>
            </>
          }
        />
      </div>

      {/* 添加/编辑/删除记录对话框 */}
      {table && (
        <>
          <RowRecordDialog
            open={rowRecordDialogOpen}
            onOpenChange={setRowRecordDialogOpen}
            mode={rowRecordDialogMode}
            table={table}
            row={rowRecordDialogRow ?? undefined}
            onSubmit={handleRowRecordSubmit}
          />
          <RowConditionDialog
            open={rowConditionDialogOpen}
            onOpenChange={setRowConditionDialogOpen}
            mode={rowConditionDialogMode}
            table={table}
            onSubmit={handleRowConditionSubmit}
          />
          <RowQueryDialog
            open={rowQueryDialogOpen}
            onOpenChange={setRowQueryDialogOpen}
            table={table}
          />
        </>
      )}

      <TableEditorHistorySidebar
        open={historySidebarOpen}
        onOpenChange={setHistorySidebarOpen}
        history={history}
        historyIndex={historyIndex}
        completedHistory={completedHistory}
        tab={historySidebarTab}
        onTabChange={setHistorySidebarTab}
        onRollbackToHistoryIndex={handleRollbackToHistoryIndex}
        onRollbackToCompleted={handleRollbackToCompleted}
      />

      <TableEditorAddColumnDialog
        open={isAddColumnDialogOpen}
        onOpenChange={(open) => {
          setIsAddColumnDialogOpen(open);
          if (!open) {
            setAddColumnInsertPosition(null);
            setAddColumnCopyFromKey(null);
          }
        }}
        table={table}
        insertPosition={addColumnInsertPosition}
        copyFromKey={addColumnCopyFromKey}
        columnKey={newColumnKey}
        setColumnKey={setNewColumnKey}
        label={newColumnLabel}
        setLabel={setNewColumnLabel}
        type={newColumnType}
        setType={setNewColumnType}
        options={newColumnOptions}
        setOptions={setNewColumnOptions}
        dateFormat={newColumnDateFormat}
        setDateFormat={setNewColumnDateFormat}
        defaultValue={newColumnDefaultValue}
        setDefaultValue={setNewColumnDefaultValue}
        onSubmit={handleSaveColumn}
      />

      <TableEditorEditColumnDialog
        open={isEditColumnDialogOpen}
        onOpenChange={setIsEditColumnDialogOpen}
        columnKey={editingColumnKey}
        label={editingColumnLabel}
        setLabel={setEditingColumnLabel}
        type={editingColumnType}
        setType={setEditingColumnType}
        options={editingColumnOptions}
        setOptions={setEditingColumnOptions}
        dateFormat={editingColumnDateFormat}
        setDateFormat={setEditingColumnDateFormat}
        defaultValue={editingColumnDefaultValue}
        setDefaultValue={setEditingColumnDefaultValue}
        onSubmit={handleSaveEditColumn}
      />

      <TableEditorColumnVisibilitySheet
        open={columnVisibilitySheetOpen}
        onOpenChange={setColumnVisibilitySheetOpen}
        columns={table?.columns ?? []}
        hiddenColumnKeys={hiddenColumnKeys}
        onHiddenColumnKeysChange={handleHiddenColumnKeysChange}
      />
    </div>
  );
}

export const TableEditor = observer(TableEditorImpl);
