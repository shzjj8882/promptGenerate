"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, X, Save, Undo2, Redo2, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getTables,
  getTable,
  updateTable,
  type MultiDimensionTable,
  type TableRow as TableRowType,
  type TableColumn,
  type TableRowBulkData,
} from "@/lib/api/multi-dimension-tables";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { CanvasSpreadsheetTableView } from "@/app/dashboard/config/tables/canvas-spreadsheet-table-view";
import { DatePicker, DATE_FORMATS } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";

interface TableEditorProps {
  tableId: string;
  onTableUpdated?: () => void;
  initialTable?: MultiDimensionTable;
  initialRows?: TableRowType[];
}

function TableEditorImpl({ tableId, onTableUpdated, initialTable, initialRows }: TableEditorProps) {
  const [table, setTable] = useState<MultiDimensionTable | null>(initialTable || null);
  const [loading, setLoading] = useState(!initialTable);
  const [tableRows, setTableRows] = useState<TableRowType[]>(initialRows || []);
  const [loadingRows, setLoadingRows] = useState(false);
  
  // 本地编辑状态
  const [localRows, setLocalRows] = useState<TableRowType[]>(initialRows || []);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // 撤销/重做历史记录
  type HistoryState = {
    rows: TableRowType[];
    columns: TableColumn[];
  };
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const historyIndexRef = useRef<number>(-1); // 使用 ref 存储最新的 historyIndex，避免闭包问题
  const [isUndoRedo, setIsUndoRedo] = useState(false);
  const historyInitializedRef = useRef<boolean>(false); // 标记历史记录是否已初始化
  
  // 同步 historyIndex 到 ref
  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);
  
  // 添加列对话框状态
  const [isAddColumnDialogOpen, setIsAddColumnDialogOpen] = useState(false);
  const [newColumnKey, setNewColumnKey] = useState("");
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [newColumnType, setNewColumnType] = useState<string>("text");
  const [newColumnOptions, setNewColumnOptions] = useState<Array<{key: string, value: string}>>([]);
  const [newColumnDateFormat, setNewColumnDateFormat] = useState<string>("YYYY/MM/DD");
  const [newColumnDefaultValue, setNewColumnDefaultValue] = useState<string>("");
  
  // 编辑列对话框状态
  const [isEditColumnDialogOpen, setIsEditColumnDialogOpen] = useState(false);
  const [editingColumnKey, setEditingColumnKey] = useState<string>("");
  const [editingColumnLabel, setEditingColumnLabel] = useState("");
  const [editingColumnType, setEditingColumnType] = useState<string>("text");
  const [editingColumnOptions, setEditingColumnOptions] = useState<Array<{key: string, value: string}>>([]);
  const [editingColumnDateFormat, setEditingColumnDateFormat] = useState<string>("YYYY/MM/DD");
  const [editingColumnDefaultValue, setEditingColumnDefaultValue] = useState<string>("");

  const { handleError } = useErrorHandler({
    showToast: true,
  });

  // 辅助函数：将日期字符串从旧格式转换为新格式
  const convertDateFormat = (dateValue: string, oldFormat: string, newFormat: string): string => {
    if (!dateValue) return "";
    
    try {
      let date: Date | null = null;
      date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        if (year >= 1900 && year <= 2100) {
          const formatOption = DATE_FORMATS.find(f => f.value === newFormat);
          if (formatOption) {
            return formatOption.format(date);
          }
        }
      }
      
      const patterns = [
        /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
        /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
      ];
      
      for (const pattern of patterns) {
        const match = dateValue.match(pattern);
        if (match) {
          let year: number, month: number, day: number;
          
          if (pattern === patterns[0]) {
            year = parseInt(match[1], 10);
            month = parseInt(match[2], 10) - 1;
            day = parseInt(match[3], 10);
          } else {
            if (oldFormat === "DD/MM/YYYY") {
              day = parseInt(match[1], 10);
              month = parseInt(match[2], 10) - 1;
              year = parseInt(match[3], 10);
            } else {
              month = parseInt(match[1], 10) - 1;
              day = parseInt(match[2], 10);
              year = parseInt(match[3], 10);
            }
          }
          
          date = new Date(year, month, day);
          if (!isNaN(date.getTime())) {
            const formatOption = DATE_FORMATS.find(f => f.value === newFormat);
            if (formatOption) {
              return formatOption.format(date);
            }
          }
        }
      }
      
      return dateValue;
    } catch {
      return dateValue;
    }
  };

  const fetchTableRows = useCallback(async (tableId: string) => {
    if (!tableId) return;
    try {
      setLoadingRows(true);
      // 使用合并后的接口获取表格和行数据
      const tableData = await getTable(tableId, true);
      const data = tableData.rows || [];
      setTableRows(data);
      setLocalRows(data);
      setHasUnsavedChanges(false);
    } catch (error) {
      handleError(error, "加载表格行数据失败");
    } finally {
      setLoadingRows(false);
    }
  }, [handleError]);

  const fetchTableData = useCallback(async () => {
    if (!tableId) return;
    try {
      setLoading(true);
      // 一次性获取表格信息和行数据
      const tableData = await getTable(tableId, true);
      setTable(tableData);
      const rowsData = tableData.rows || [];
      setTableRows(rowsData);
      setLocalRows(rowsData);
      
      // 初始化历史记录
      const initialState: HistoryState = {
        rows: JSON.parse(JSON.stringify(rowsData)),
        columns: JSON.parse(JSON.stringify(tableData.columns || [])),
      };
      setHistory([initialState]);
      setHistoryIndex(0);
      setHasUnsavedChanges(false);
    } catch (error) {
      handleError(error, "加载表格失败");
    } finally {
      setLoading(false);
    }
  }, [tableId, handleError]);

  // 初始化：如果有初始数据，直接使用；否则从服务端获取
  useEffect(() => {
    if (initialTable && initialRows) {
      // 使用 SSR 传入的初始数据（只在首次加载时执行）
      if (!table || table.id !== initialTable.id) {
        setTable(initialTable);
        setTableRows(initialRows);
        setLocalRows(initialRows);
        
        // 初始化历史记录
        const initialState: HistoryState = {
          rows: JSON.parse(JSON.stringify(initialRows)),
          columns: JSON.parse(JSON.stringify(initialTable.columns || [])),
        };
        setHistory([initialState]);
        setHistoryIndex(0);
        historyIndexRef.current = 0;
        historyInitializedRef.current = true;
        setHasUnsavedChanges(false);
        setLoading(false);
      }
    } else if (!table && tableId) {
      // 没有初始数据时才请求
      fetchTableData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, initialTable?.id]); // 只在 tableId 或 initialTable.id 变化时重新获取

  // 记录历史状态
  const recordHistory = useCallback((rows: TableRowType[], columns: TableColumn[]) => {
    console.log('[记录历史] 开始记录历史', {
      isUndoRedo,
      historyInitialized: historyInitializedRef.current,
      rowsCount: rows.length,
      columnsCount: columns.length,
      currentHistoryIndex: historyIndexRef.current,
    });
    
    if (isUndoRedo) {
      console.log('[记录历史] 跳过记录（撤销/重做操作）');
      return;
    }
    
    // 如果历史记录还未初始化，不记录（等待初始化）
    if (!historyInitializedRef.current) {
      console.log('[记录历史] 跳过记录（历史记录未初始化）');
      return;
    }
    
    const newState: HistoryState = {
      rows: JSON.parse(JSON.stringify(rows)),
      columns: JSON.parse(JSON.stringify(columns)),
    };
    
    console.log('[记录历史] 创建新状态', {
      newStateRowsCount: newState.rows.length,
      deletedRowsCount: newState.rows.filter((r: any) => r._deleted).length,
    });
    
    setHistory(prev => {
      const currentIndex = historyIndexRef.current; // 使用 ref 获取最新值
      
      console.log('[记录历史] 更新历史记录', {
        prevHistoryLength: prev.length,
        currentIndex,
      });
      
      // 如果历史记录为空，不应该发生（因为已经检查了 historyInitializedRef）
      // 但为了安全，还是处理一下
      if (prev.length === 0) {
        console.log('[记录历史] 历史记录为空，初始化第一条记录');
        const newHistory = [newState];
        const newIndex = 0;
        setHistoryIndex(newIndex);
        historyIndexRef.current = newIndex;
        console.log('[记录历史] 历史记录已初始化', {
          newHistoryLength: newHistory.length,
          newIndex,
        });
        return newHistory;
      }
      
      const newHistory = prev.slice(0, currentIndex + 1);
      newHistory.push(newState);
      if (newHistory.length > 50) {
        newHistory.shift();
      }
      const newIndex = newHistory.length - 1;
      setHistoryIndex(newIndex);
      historyIndexRef.current = newIndex; // 同步更新 ref
      
      console.log('[记录历史] 历史记录已更新', {
        newHistoryLength: newHistory.length,
        newIndex,
        deletedRowsInNewState: newState.rows.filter((r: any) => r._deleted).length,
      });
      
      return newHistory;
    });
  }, [isUndoRedo]);

  // 撤销操作
  const handleUndo = useCallback(() => {
    if (historyIndex <= 0 || !table) return;
    
    setIsUndoRedo(true);
    const prevIndex = historyIndex - 1;
    const prevState = history[prevIndex];
    
    if (prevState) {
      setLocalRows(prevState.rows);
      setTable({
        ...table,
        columns: prevState.columns,
      });
      setHistoryIndex(prevIndex);
      setHasUnsavedChanges(prevIndex !== 0);
    }
    
    setTimeout(() => setIsUndoRedo(false), 0);
  }, [historyIndex, history, table]);

  // 重做操作
  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1 || !table) return;
    
    setIsUndoRedo(true);
    const nextIndex = historyIndex + 1;
    const nextState = history[nextIndex];
    
    if (nextState) {
      setLocalRows(nextState.rows);
      setTable({
        ...table,
        columns: nextState.columns,
      });
      setHistoryIndex(nextIndex);
      setHasUnsavedChanges(true);
    }
    
    setTimeout(() => setIsUndoRedo(false), 0);
  }, [historyIndex, history.length, history, table]);

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (historyIndex > 0 && !saving) {
          handleUndo();
        }
      }
      if (((e.ctrlKey || e.metaKey) && e.key === 'y') || 
          ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        if (historyIndex < history.length - 1 && !saving) {
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history.length, saving, handleUndo, handleRedo]);

  const handleCellChange = (rowId: string, columnKey: string, value: string) => {
    if (!table) return;
    const newRows = localRows.map(r => 
      r.id === rowId 
        ? { ...r, cells: { ...r.cells, [columnKey]: value } }
        : r
    );
    setLocalRows(newRows);
    setHasUnsavedChanges(true);
    recordHistory(newRows, table.columns);
  };

  // 保存所有更改到后端
  const handleSave = async () => {
    if (!table || !hasUnsavedChanges) return;
    
    try {
      setSaving(true);
      
      // 准备批量保存的数据（全量保存，排除已标记删除的行）
      // 保留已存在行的 row_id，只对新行自动生成 row_id
      const rowsToSave: TableRowBulkData[] = localRows
        .filter(row => !(row as any)._deleted) // 排除已标记删除的行
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
      setTableRows(savedRows);
      setLocalRows(savedRows);
      setHasUnsavedChanges(false);
      
      // 重置历史记录
      const newInitialState: HistoryState = {
        rows: JSON.parse(JSON.stringify(savedRows)),
        columns: JSON.parse(JSON.stringify(updatedTable.columns || table.columns)),
      };
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

  const handleCreateRow = () => {
    if (!table) return;
    
    // 初始化单元格数据，使用列的默认值（不复制上一行数据）
    const initialCells: Record<string, string> = {};
    table.columns.forEach(col => {
      initialCells[col.key] = col.options?.defaultValue || "";
    });
    
    // 计算临时 row_id：基于当前最大 row_id + 1
    const maxRowId = localRows.length > 0 
      ? Math.max(...localRows.map(r => r.row_id >= 0 ? r.row_id : -1), -1)
      : -1;
    const tempRowId = maxRowId + 1;
    
    // 创建临时行，使用临时 row_id（保存时后端会重新分配）
    const tempRow: TableRowType = {
      id: `temp-${Date.now()}-${Math.random()}`,
      table_id: table.id,
      row_id: tempRowId, // 临时 row_id，保存时后端会重新分配
      cells: initialCells,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    const newRows = [...localRows, tempRow];
    setLocalRows(newRows);
    setHasUnsavedChanges(true);
    recordHistory(newRows, table.columns);
  };

  const handleDeleteRow = (row: TableRowType) => {
    if (!table) return;
    
    console.log('[删除行] 开始删除操作', {
      rowId: row.id,
      historyInitialized: historyInitializedRef.current,
      historyLength: history.length,
      historyIndex: historyIndexRef.current,
      localRowsCount: localRows.length,
    });
    
    // 确保历史记录已初始化（如果未初始化，先初始化）
    if (!historyInitializedRef.current && history.length === 0) {
      console.log('[删除行] 历史记录未初始化，先初始化历史记录');
      const initialState: HistoryState = {
        rows: JSON.parse(JSON.stringify(localRows)),
        columns: JSON.parse(JSON.stringify(table.columns)),
      };
      setHistory([initialState]);
      setHistoryIndex(0);
      historyIndexRef.current = 0;
      historyInitializedRef.current = true;
      console.log('[删除行] 历史记录已初始化', {
        initialStateRowsCount: initialState.rows.length,
      });
    }
    
    // 标记行为已删除（保留 id，避免其他行的 id 变化）
    const newRows = localRows.map(r => 
      r.id === row.id ? { ...r, _deleted: true } : r
    );
    setLocalRows(newRows);
    setHasUnsavedChanges(true);
    
    console.log('[删除行] 准备记录历史', {
      newRowsCount: newRows.length,
      deletedRowId: row.id,
    });
    
    recordHistory(newRows, table.columns);
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
      setTableRows(newRows);
      
      // 标记为有未保存的更改
      setHasUnsavedChanges(true);
      recordHistory(newRows, updatedColumns);
    }
  }, [table, localRows, recordHistory]);

  // 处理 Excel 导入
  const handleImportRows = useCallback((importedRows: TableRowType[], mode: "append" | "replace" = "append") => {
    if (!table) return;
    
    let newRows: TableRowType[];
    if (mode === "replace") {
      // 替换模式：清空现有数据，使用导入的数据
      newRows = importedRows;
    } else {
      // 追加模式：将导入的行添加到现有数据之后
      newRows = [...localRows, ...importedRows];
    }
    
    setLocalRows(newRows);
    setTableRows(newRows);
    setHasUnsavedChanges(true);
    
    // 记录历史
    recordHistory(newRows, table.columns);
  }, [table, localRows, recordHistory]);

  const handleAddColumn = () => {
    setNewColumnKey("");
    setNewColumnLabel("");
    setNewColumnType("text");
    setNewColumnOptions([]);
    setNewColumnDateFormat("YYYY/MM/DD");
    setNewColumnDefaultValue("");
    setIsAddColumnDialogOpen(true);
  };

  const handleSaveColumn = () => {
    if (!table) return;
    if (!newColumnKey.trim() || !newColumnLabel.trim()) {
      handleError(new Error("请填写完整信息"), "请填写列 key 和列名称");
      return;
    }

    if (table.columns.some(col => col.key === newColumnKey.trim())) {
      handleError(new Error("列 key 已存在"), "列 key 不能重复");
      return;
    }

    if (newColumnType === "single_select" || newColumnType === "multi_select") {
      const validOptions = newColumnOptions.filter(opt => opt.value.trim());
      
      if (validOptions.length === 0) {
        handleError(new Error("请至少添加一个选项"), "单选/多选类型需要至少一个选项");
        return;
      }
      
      const optionValues = validOptions.map(opt => opt.value.trim());
      const uniqueValues = new Set(optionValues);
      if (optionValues.length !== uniqueValues.size) {
        handleError(new Error("选项值不能重复"), "选项值不能重复");
        return;
      }
      
      if (newColumnDefaultValue.trim()) {
        if (newColumnType === "single_select") {
          if (!optionValues.includes(newColumnDefaultValue.trim())) {
            handleError(new Error("默认值必须在选项中"), "默认值必须在选项列表中");
            return;
          }
        } else if (newColumnType === "multi_select") {
          const defaultValues = newColumnDefaultValue.split(",").map(v => v.trim()).filter(v => v);
          const invalidValues = defaultValues.filter(v => !optionValues.includes(v));
          if (invalidValues.length > 0) {
            handleError(new Error("默认值中的某些值不在选项中"), `默认值 "${invalidValues.join(", ")}" 不在选项列表中`);
            return;
          }
        }
      }
    }

    const newColumn: TableColumn = {
      key: newColumnKey.trim(),
      label: newColumnLabel.trim(),
      type: newColumnType,
    };
    
    const columnOptions: Record<string, any> = {};
    
    if (newColumnType === "single_select" || newColumnType === "multi_select") {
      const validOptions = newColumnOptions.filter(opt => opt.value.trim());
      columnOptions.options = validOptions.map(opt => opt.value.trim());
    }
    
    if (newColumnType === "date") {
      columnOptions.format = newColumnDateFormat;
    }
    
    if (newColumnDefaultValue.trim()) {
      columnOptions.defaultValue = newColumnDefaultValue.trim();
    }
    
    if (Object.keys(columnOptions).length > 0) {
      newColumn.options = columnOptions;
    }
    
    const updatedColumns = [...table.columns, newColumn];
    const defaultValue = newColumn.options?.defaultValue || "";
    const newRows = localRows.map(row => ({
      ...row,
      cells: {
        ...row.cells,
        [newColumn.key]: defaultValue,
      },
    }));
    
    setTable({
      ...table,
      columns: updatedColumns,
    });
    setLocalRows(newRows);
    setHasUnsavedChanges(true);
    recordHistory(newRows, updatedColumns);
    
    setIsAddColumnDialogOpen(false);
    setNewColumnKey("");
    setNewColumnLabel("");
    setNewColumnType("text");
  };

  const handleDeleteColumn = (columnKey: string) => {
    if (!table) return;

    const updatedColumns = table.columns.filter(col => col.key !== columnKey);
    const newRows = localRows.map(row => {
      const newCells = { ...row.cells };
      delete newCells[columnKey];
      return { ...row, cells: newCells };
    });
    
    setTable({
      ...table,
      columns: updatedColumns,
    });
    setLocalRows(newRows);
    setHasUnsavedChanges(true);
    recordHistory(newRows, updatedColumns);
  };

  const handleEditColumn = (columnKey: string) => {
    const column = table?.columns.find(col => col.key === columnKey);
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
  };

  const handleSaveEditColumn = () => {
    if (!table) return;
    if (!editingColumnLabel.trim()) {
      handleError(new Error("请填写列名称"), "列名称不能为空");
      return;
    }

    if (editingColumnType === "single_select" || editingColumnType === "multi_select") {
      const validOptions = editingColumnOptions.filter(opt => opt.value.trim());
      
      if (validOptions.length === 0) {
        handleError(new Error("请至少添加一个选项"), "单选/多选类型需要至少一个选项");
        return;
      }
      
      const optionValues = validOptions.map(opt => opt.value.trim());
      const uniqueValues = new Set(optionValues);
      if (optionValues.length !== uniqueValues.size) {
        handleError(new Error("选项值不能重复"), "选项值不能重复");
        return;
      }
      
      if (editingColumnDefaultValue.trim()) {
        if (editingColumnType === "single_select") {
          if (!optionValues.includes(editingColumnDefaultValue.trim())) {
            handleError(new Error("默认值必须在选项中"), "默认值必须在选项列表中");
            return;
          }
        } else if (editingColumnType === "multi_select") {
          const defaultValues = editingColumnDefaultValue.split(",").map(v => v.trim()).filter(v => v);
          const invalidValues = defaultValues.filter(v => !optionValues.includes(v));
          if (invalidValues.length > 0) {
            handleError(new Error("默认值中的某些值不在选项中"), `默认值 "${invalidValues.join(", ")}" 不在选项列表中`);
            return;
          }
        }
      }
    }

    const updatedColumns = table.columns.map(col => {
      if (col.key === editingColumnKey) {
        const updatedCol: TableColumn = {
          ...col,
          label: editingColumnLabel.trim(),
          type: editingColumnType,
        };
        
        const columnOptions: Record<string, any> = {};
        
        if (editingColumnType === "single_select" || editingColumnType === "multi_select") {
          const validOptions = editingColumnOptions.filter(opt => opt.value.trim());
          columnOptions.options = validOptions.map(opt => opt.value.trim());
        }
        
        if (editingColumnType === "date") {
          columnOptions.format = editingColumnDateFormat;
        }
        
        if (editingColumnDefaultValue.trim()) {
          columnOptions.defaultValue = editingColumnDefaultValue.trim();
        }
        
        if (Object.keys(columnOptions).length > 0) {
          updatedCol.options = columnOptions;
        } else {
          delete updatedCol.options;
        }
        
        return updatedCol;
      }
      return col;
    });
    
    setTable({
      ...table,
      columns: updatedColumns,
    });
    setHasUnsavedChanges(true);
    recordHistory(localRows, updatedColumns);
    
    setIsEditColumnDialogOpen(false);
    setEditingColumnKey("");
    setEditingColumnLabel("");
    setEditingColumnType("text");
    setEditingColumnOptions([]);
    setEditingColumnDateFormat("YYYY/MM/DD");
    setEditingColumnDefaultValue("");
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (!table) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">表格不存在</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden min-h-0">
      <div className="rounded-lg border bg-card flex flex-col overflow-hidden flex-1 min-h-0">
        <CanvasSpreadsheetTableView
          table={table}
          rows={localRows}
          loading={loadingRows}
          onCellChange={handleCellChange}
          onAddRow={handleCreateRow}
          onAddColumn={handleAddColumn}
          onDeleteColumn={handleDeleteColumn}
          onEditColumn={handleEditColumn}
          onDeleteRow={handleDeleteRow}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onSave={handleSave}
          saving={saving}
          hasUnsavedChanges={hasUnsavedChanges}
          onImportRows={handleImportRows}
          onImportColumns={handleImportColumns}
        />
      </div>

      {/* 添加列对话框 */}
      <Dialog open={isAddColumnDialogOpen} onOpenChange={setIsAddColumnDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>添加列</DialogTitle>
            <DialogDescription>添加一个新的列到表格中</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="column-key">
                Key <span className="text-destructive">*</span>
              </Label>
              <Input
                id="column-key"
                value={newColumnKey}
                onChange={(e) => setNewColumnKey(e.target.value)}
                placeholder="例如: email"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                列的唯一标识，创建后不可修改
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="column-label">
                列名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="column-label"
                value={newColumnLabel}
                onChange={(e) => setNewColumnLabel(e.target.value)}
                placeholder="例如: 邮箱"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="column-type">
                数据类型 <span className="text-destructive">*</span>
              </Label>
              <Select
                value={newColumnType}
                onValueChange={(value) => {
                  setNewColumnType(value);
                  if (value !== "single_select" && value !== "multi_select") {
                    setNewColumnOptions([]);
                  }
                  if (value !== "date") {
                    setNewColumnDateFormat("YYYY/MM/DD");
                  }
                  setNewColumnDefaultValue("");
                }}
              >
                <SelectTrigger id="column-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="w-full">
                  <SelectItem value="text">文本</SelectItem>
                  <SelectItem value="number">数字</SelectItem>
                  <SelectItem value="date">日期</SelectItem>
                  <SelectItem value="single_select">单选</SelectItem>
                  <SelectItem value="multi_select">多选</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {(newColumnType === "single_select" || newColumnType === "multi_select") && (
              <div className="space-y-2">
                <Label>
                  选项配置 <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  至少需要添加一个选项，选项值不能为空且不能重复
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                  {newColumnOptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      暂无选项，请点击下方按钮添加
                    </p>
                  ) : (
                    newColumnOptions.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={option.value}
                          onChange={(e) => {
                            const updated = [...newColumnOptions];
                            updated[index].value = e.target.value;
                            setNewColumnOptions(updated);
                          }}
                          placeholder={`选项 ${index + 1}`}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setNewColumnOptions(newColumnOptions.filter((_, i) => i !== index));
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setNewColumnOptions([...newColumnOptions, { key: "", value: "" }]);
                    }}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    添加选项
                  </Button>
                </div>
              </div>
            )}
            
            {newColumnType === "date" && (
              <div className="space-y-2">
                <Label>日期格式</Label>
                <Select
                  value={newColumnDateFormat}
                  onValueChange={(newFormat) => {
                    if (newColumnDefaultValue) {
                      const convertedValue = convertDateFormat(
                        newColumnDefaultValue,
                        newColumnDateFormat,
                        newFormat
                      );
                      setNewColumnDefaultValue(convertedValue);
                    }
                    setNewColumnDateFormat(newFormat);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="w-full">
                    {DATE_FORMATS.map((format) => (
                      <SelectItem key={format.value} value={format.value}>
                        {format.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>默认值</Label>
              {newColumnType === "date" ? (
                <DatePicker
                  value={newColumnDefaultValue}
                  onChange={(value) => setNewColumnDefaultValue(value)}
                  format={newColumnDateFormat}
                  placeholder="选择默认日期"
                />
              ) : newColumnType === "single_select" ? (
                <Select
                  value={newColumnDefaultValue || "__none__"}
                  onValueChange={(value) => {
                    setNewColumnDefaultValue(value === "__none__" ? "" : value);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择默认值（可选）" />
                  </SelectTrigger>
                  <SelectContent className="w-full">
                    <SelectItem value="__none__">无默认值</SelectItem>
                    {newColumnOptions
                      .filter(option => option.value.trim())
                      .map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.value}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : newColumnType === "multi_select" ? (
                <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                  {newColumnOptions.filter(opt => opt.value.trim()).length === 0 ? (
                    <p className="text-sm text-muted-foreground">请先配置选项</p>
                  ) : (
                    newColumnOptions
                      .filter(option => option.value.trim())
                      .map((option) => {
                        const selectedValues = newColumnDefaultValue ? newColumnDefaultValue.split(",").filter(v => v) : [];
                        return (
                          <div key={option.value} className="flex items-center space-x-2">
                            <Checkbox
                              checked={selectedValues.includes(option.value)}
                              onCheckedChange={(checked) => {
                                let newValues: string[];
                                if (checked) {
                                  newValues = [...selectedValues, option.value];
                                } else {
                                  newValues = selectedValues.filter(v => v !== option.value);
                                }
                                setNewColumnDefaultValue(newValues.join(","));
                              }}
                            />
                            <label className="text-sm cursor-pointer" onClick={() => {
                              const selectedValues = newColumnDefaultValue ? newColumnDefaultValue.split(",").filter(v => v) : [];
                              const isChecked = selectedValues.includes(option.value);
                              let newValues: string[];
                              if (isChecked) {
                                newValues = selectedValues.filter(v => v !== option.value);
                              } else {
                                newValues = [...selectedValues, option.value];
                              }
                              setNewColumnDefaultValue(newValues.join(","));
                            }}>
                              {option.value}
                            </label>
                          </div>
                        );
                      })
                  )}
                </div>
              ) : newColumnType === "number" ? (
                <Input
                  type="number"
                  value={newColumnDefaultValue}
                  onChange={(e) => setNewColumnDefaultValue(e.target.value)}
                  placeholder="可选，新建行时自动填充此值"
                />
              ) : (
                <Input
                  value={newColumnDefaultValue}
                  onChange={(e) => setNewColumnDefaultValue(e.target.value)}
                  placeholder="可选，新建行时自动填充此值"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddColumnDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleSaveColumn}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑列对话框 */}
      <Dialog open={isEditColumnDialogOpen} onOpenChange={setIsEditColumnDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>编辑列</DialogTitle>
            <DialogDescription>
              编辑列的显示名称和数据类型
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-column-key">Key</Label>
              <Input
                id="edit-column-key"
                value={editingColumnKey}
                disabled
                className="font-mono bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                列的唯一标识，不可修改
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-column-label">
                列名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-column-label"
                value={editingColumnLabel}
                onChange={(e) => setEditingColumnLabel(e.target.value)}
                placeholder="例如: 邮箱"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-column-type">
                数据类型 <span className="text-destructive">*</span>
              </Label>
              <Select
                value={editingColumnType}
                onValueChange={(value) => {
                  setEditingColumnType(value);
                  if (value !== "single_select" && value !== "multi_select") {
                    setEditingColumnOptions([]);
                  }
                  if (value !== "date") {
                    setEditingColumnDateFormat("YYYY/MM/DD");
                  }
                  setEditingColumnDefaultValue("");
                }}
              >
                <SelectTrigger id="edit-column-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="w-full">
                  <SelectItem value="text">文本</SelectItem>
                  <SelectItem value="number">数字</SelectItem>
                  <SelectItem value="date">日期</SelectItem>
                  <SelectItem value="single_select">单选</SelectItem>
                  <SelectItem value="multi_select">多选</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {(editingColumnType === "single_select" || editingColumnType === "multi_select") && (
              <div className="space-y-2">
                <Label>
                  选项配置 <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  至少需要添加一个选项，选项值不能为空且不能重复
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                  {editingColumnOptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      暂无选项，请点击下方按钮添加
                    </p>
                  ) : (
                    editingColumnOptions.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={option.value}
                          onChange={(e) => {
                            const updated = [...editingColumnOptions];
                            updated[index].value = e.target.value;
                            setEditingColumnOptions(updated);
                          }}
                          placeholder={`选项 ${index + 1}`}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingColumnOptions(editingColumnOptions.filter((_, i) => i !== index));
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingColumnOptions([...editingColumnOptions, { key: "", value: "" }]);
                    }}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    添加选项
                  </Button>
                </div>
              </div>
            )}
            
            {editingColumnType === "date" && (
              <div className="space-y-2">
                <Label>日期格式</Label>
                <Select
                  value={editingColumnDateFormat}
                  onValueChange={(newFormat) => {
                    if (editingColumnDefaultValue) {
                      const convertedValue = convertDateFormat(
                        editingColumnDefaultValue,
                        editingColumnDateFormat,
                        newFormat
                      );
                      setEditingColumnDefaultValue(convertedValue);
                    }
                    setEditingColumnDateFormat(newFormat);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="w-full">
                    {DATE_FORMATS.map((format) => (
                      <SelectItem key={format.value} value={format.value}>
                        {format.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>默认值</Label>
              {editingColumnType === "date" ? (
                <DatePicker
                  value={editingColumnDefaultValue}
                  onChange={(value) => setEditingColumnDefaultValue(value)}
                  format={editingColumnDateFormat}
                  placeholder="选择默认日期"
                />
              ) : editingColumnType === "single_select" ? (
                <Select
                  value={editingColumnDefaultValue || "__none__"}
                  onValueChange={(value) => {
                    setEditingColumnDefaultValue(value === "__none__" ? "" : value);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择默认值（可选）" />
                  </SelectTrigger>
                  <SelectContent className="w-full">
                    <SelectItem value="__none__">无默认值</SelectItem>
                    {editingColumnOptions
                      .filter(option => option.value.trim())
                      .map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.value}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : editingColumnType === "multi_select" ? (
                <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                  {editingColumnOptions.filter(opt => opt.value.trim()).length === 0 ? (
                    <p className="text-sm text-muted-foreground">请先配置选项</p>
                  ) : (
                    editingColumnOptions
                      .filter(option => option.value.trim())
                      .map((option) => {
                        const selectedValues = editingColumnDefaultValue ? editingColumnDefaultValue.split(",").filter(v => v) : [];
                        return (
                          <div key={option.value} className="flex items-center space-x-2">
                            <Checkbox
                              checked={selectedValues.includes(option.value)}
                              onCheckedChange={(checked) => {
                                let newValues: string[];
                                if (checked) {
                                  newValues = [...selectedValues, option.value];
                                } else {
                                  newValues = selectedValues.filter(v => v !== option.value);
                                }
                                setEditingColumnDefaultValue(newValues.join(","));
                              }}
                            />
                            <label className="text-sm cursor-pointer" onClick={() => {
                              const selectedValues = editingColumnDefaultValue ? editingColumnDefaultValue.split(",").filter(v => v) : [];
                              const isChecked = selectedValues.includes(option.value);
                              let newValues: string[];
                              if (isChecked) {
                                newValues = selectedValues.filter(v => v !== option.value);
                              } else {
                                newValues = [...selectedValues, option.value];
                              }
                              setEditingColumnDefaultValue(newValues.join(","));
                            }}>
                              {option.value}
                            </label>
                          </div>
                        );
                      })
                  )}
                </div>
              ) : editingColumnType === "number" ? (
                <Input
                  type="number"
                  value={editingColumnDefaultValue}
                  onChange={(e) => setEditingColumnDefaultValue(e.target.value)}
                  placeholder="可选，新建行时自动填充此值"
                />
              ) : (
                <Input
                  value={editingColumnDefaultValue}
                  onChange={(e) => setEditingColumnDefaultValue(e.target.value)}
                  placeholder="可选，新建行时自动填充此值"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditColumnDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleSaveEditColumn}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const TableEditor = observer(TableEditorImpl);
