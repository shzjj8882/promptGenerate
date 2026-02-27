"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Search, X, Save, Undo2, Redo2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  createTable,
  updateTable,
  deleteTable,
  getTableRows,
  searchTable,
  type TableRowBulkData,
  type MultiDimensionTable,
  type MultiDimensionTableCreate,
  type MultiDimensionTableUpdate,
  type TableRow as TableRowType,
  type TableRowCreate,
  type TableRowUpdate,
  type TableColumn,
} from "@/lib/api/multi-dimension-tables";
import { filterNonDeletedRows } from "@/lib/utils/table-rows";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { SpreadsheetTableView } from "./spreadsheet-table-view";
import { CanvasSpreadsheetTableView } from "./canvas-spreadsheet-table-view";
import { DatePicker, DATE_FORMATS } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Label as LabelPrimitive } from "@/components/ui/label";

function TablesConfigClientImpl() {
  const [table, setTable] = useState<MultiDimensionTable | null>(null);
  const [useCanvasMode, setUseCanvasMode] = useState(true); // Canvas 渲染模式开关（默认开启）
  const [loading, setLoading] = useState(false);
  const [tableRows, setTableRows] = useState<TableRowType[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  
  // 本地编辑状态：跟踪哪些行是新创建的（临时ID）或已修改的
  const [localRows, setLocalRows] = useState<TableRowType[]>([]);
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
  
  // 当 table 和 localRows 都准备好时，初始化历史记录
  useEffect(() => {
    if (table && localRows.length >= 0 && !historyInitializedRef.current && !loadingRows && !loading) {
      const initialState: HistoryState = {
        rows: JSON.parse(JSON.stringify(localRows)),
        columns: JSON.parse(JSON.stringify(table.columns)),
      };
      setHistory([initialState]);
      setHistoryIndex(0);
      historyIndexRef.current = 0;
      historyInitializedRef.current = true;
    }
  }, [table?.id, table?.columns, localRows.length, loadingRows, loading]);
  
  // 添加列对话框状态
  const [isAddColumnDialogOpen, setIsAddColumnDialogOpen] = useState(false);
  const [deleteTableDialogOpen, setDeleteTableDialogOpen] = useState(false);
  const [newColumnKey, setNewColumnKey] = useState("");
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [newColumnType, setNewColumnType] = useState<string>("text");
  const [newColumnOptions, setNewColumnOptions] = useState<Array<{key: string, value: string}>>([]);
  const [newColumnDateFormat, setNewColumnDateFormat] = useState<string>("YYYY/MM/DD");
  const [newColumnDefaultValue, setNewColumnDefaultValue] = useState<string>("");
  const [savingColumn, setSavingColumn] = useState(false);
  
  // 编辑列对话框状态
  const [isEditColumnDialogOpen, setIsEditColumnDialogOpen] = useState(false);
  const [editingColumnKey, setEditingColumnKey] = useState<string>("");
  const [editingColumnLabel, setEditingColumnLabel] = useState("");
  const [editingColumnType, setEditingColumnType] = useState<string>("text");
  const [editingColumnOptions, setEditingColumnOptions] = useState<Array<{key: string, value: string}>>([]);
  const [editingColumnDateFormat, setEditingColumnDateFormat] = useState<string>("YYYY/MM/DD");
  const [editingColumnDefaultValue, setEditingColumnDefaultValue] = useState<string>("");
  
  // 搜索状态
  const [searchColumnKey, setSearchColumnKey] = useState<string>("");
  const [searchValue, setSearchValue] = useState<string>("");

  const { handleError } = useErrorHandler({
    showToast: true,
  });

  // 辅助函数：将日期字符串从旧格式转换为新格式
  const convertDateFormat = (dateValue: string, oldFormat: string, newFormat: string): string => {
    if (!dateValue) return "";
    
    try {
      // 尝试多种方式解析日期
      let date: Date | null = null;
      
      // 方法1: 直接使用 Date 构造函数（适用于 ISO 格式和常见格式）
      date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        // 验证日期是否合理（避免解析错误但得到无效日期）
        const year = date.getFullYear();
        if (year >= 1900 && year <= 2100) {
          const formatOption = DATE_FORMATS.find(f => f.value === newFormat);
          if (formatOption) {
            return formatOption.format(date);
          }
        }
      }
      
      // 如果直接解析失败，尝试手动解析常见格式
      // 例如：YYYY/MM/DD, YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY
      const patterns = [
        /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/, // YYYY/MM/DD 或 YYYY-MM-DD
        /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // MM/DD/YYYY 或 DD/MM/YYYY
      ];
      
      for (const pattern of patterns) {
        const match = dateValue.match(pattern);
        if (match) {
          let year: number, month: number, day: number;
          
          if (pattern === patterns[0]) {
            // YYYY/MM/DD 格式
            year = parseInt(match[1], 10);
            month = parseInt(match[2], 10) - 1; // 月份从 0 开始
            day = parseInt(match[3], 10);
          } else {
            // MM/DD/YYYY 或 DD/MM/YYYY - 需要根据 oldFormat 判断
            if (oldFormat === "DD/MM/YYYY") {
              day = parseInt(match[1], 10);
              month = parseInt(match[2], 10) - 1;
              year = parseInt(match[3], 10);
            } else {
              // 默认 MM/DD/YYYY
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
      
      // 如果所有解析都失败，返回原值
      return dateValue;
    } catch {
      return dateValue;
    }
  };

  const fetchTableRows = useCallback(async (tableId: string, tableData?: MultiDimensionTable) => {
    if (!tableId) return;
    try {
      setLoadingRows(true);
      const data = await getTableRows(tableId);
      setTableRows(data);
      setLocalRows(data); // 初始化本地行数据
      setHasUnsavedChanges(false);
      // 重置历史记录初始化标志，让 useEffect 重新初始化
      historyInitializedRef.current = false;
    } catch (error) {
      handleError(error, "加载表格行数据失败");
    } finally {
      setLoadingRows(false);
    }
  }, [handleError]);

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果正在输入，不触发快捷键
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      
      // Ctrl+Z 或 Cmd+Z: 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (historyIndex > 0 && !saving) {
          handleUndo();
        }
      }
      // Ctrl+Y 或 Ctrl+Shift+Z 或 Cmd+Shift+Z: 重做
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
  }, [historyIndex, history.length, saving]);

  const fetchTable = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getTables({ skip: 0, limit: 1 });
      // 只取第一个表格（如果存在）
      if (response.items.length > 0) {
        const tableData = response.items[0];
        setTable(tableData);
        await fetchTableRows(tableData.id); // fetchTableRows 会重置初始化标志，useEffect 会处理初始化
        } else {
        // 如果没有表格，自动创建一个默认表格（不包含任何列，第一列固定显示row_id）
        const defaultTable = await createTable({
          code: `table_${Date.now()}`,
          name: "多维表格",
          description: "",
          columns: [],
        });
        setTable(defaultTable);
        setTableRows([]);
        setLocalRows([]);
        // 重置历史记录初始化标志，让 useEffect 重新初始化
        historyInitializedRef.current = false;
      }
    } catch (error) {
      handleError(error, "加载表格失败");
    } finally {
      setLoading(false);
    }
  }, [handleError, fetchTableRows]);

  useEffect(() => {
    fetchTable();
  }, [fetchTable]);

  const handleSaveColumn = () => {
    if (!table) return;
    if (!newColumnKey.trim() || !newColumnLabel.trim()) {
      handleError(new Error("请填写完整信息"), "请填写列 key 和列名称");
      return;
    }

    // 检查 key 是否已存在
    if (table.columns.some(col => col.key === newColumnKey.trim())) {
      handleError(new Error("列 key 已存在"), "列 key 不能重复");
      return;
    }

    // 如果是单选或多选，验证选项
    if (newColumnType === "single_select" || newColumnType === "multi_select") {
      // 过滤掉空值
      const validOptions = newColumnOptions.filter(opt => opt.value.trim());
      
      if (validOptions.length === 0) {
        handleError(new Error("请至少添加一个选项"), "单选/多选类型需要至少一个选项");
        return;
      }
      
      // 检查选项值是否重复
      const optionValues = validOptions.map(opt => opt.value.trim());
      const uniqueValues = new Set(optionValues);
      if (optionValues.length !== uniqueValues.size) {
        handleError(new Error("选项值不能重复"), "选项值不能重复");
        return;
      }
      
      // 验证默认值是否在选项中
      if (newColumnDefaultValue.trim()) {
        if (newColumnType === "single_select") {
          // 单选：默认值必须在选项中
          if (!optionValues.includes(newColumnDefaultValue.trim())) {
            handleError(new Error("默认值必须在选项中"), "默认值必须在选项列表中");
            return;
          }
        } else if (newColumnType === "multi_select") {
          // 多选：默认值的每个值都必须在选项中
          const defaultValues = newColumnDefaultValue.split(",").map(v => v.trim()).filter(v => v);
          const invalidValues = defaultValues.filter(v => !optionValues.includes(v));
          if (invalidValues.length > 0) {
            handleError(new Error("默认值中的某些值不在选项中"), `默认值 "${invalidValues.join(", ")}" 不在选项列表中`);
            return;
          }
        }
      }
    }

    // 添加新列到表格定义
    const newColumn: TableColumn = {
      key: newColumnKey.trim(),
      label: newColumnLabel.trim(),
      type: newColumnType,
    };
    
    // 构建 options 对象
    const columnOptions: Record<string, any> = {};
    
    // 如果是单选或多选，添加选项
    if (newColumnType === "single_select" || newColumnType === "multi_select") {
      const validOptions = newColumnOptions.filter(opt => opt.value.trim());
      columnOptions.options = validOptions.map(opt => opt.value.trim());
    }
    
    // 如果是日期，添加格式
    if (newColumnType === "date") {
      columnOptions.format = newColumnDateFormat;
    }
    
    // 如果有默认值，添加到 options
    if (newColumnDefaultValue.trim()) {
      columnOptions.defaultValue = newColumnDefaultValue.trim();
    }
    
    if (Object.keys(columnOptions).length > 0) {
      newColumn.options = columnOptions;
    }
    
    const updatedColumns = [...table.columns, newColumn];
    
    // 为所有现有行添加新列的值（使用默认值或空）
    const defaultValue = newColumn.options?.defaultValue || "";
    const newRows = localRows.map(row => ({
      ...row,
      cells: {
        ...row.cells,
        [newColumn.key]: defaultValue, // 使用默认值
      },
    }));
    
    // 更新本地表格状态
    setTable({
      ...table,
      columns: updatedColumns,
    });
    setLocalRows(newRows);
    
    // 标记为有未保存的更改
    setHasUnsavedChanges(true);
    recordHistory(newRows, updatedColumns);
    
    // 关闭对话框并重置表单
    setIsAddColumnDialogOpen(false);
    setNewColumnKey("");
    setNewColumnLabel("");
    setNewColumnType("text");
  };

  const handleDeleteTable = () => {
    if (!table) return;
    setDeleteTableDialogOpen(true);
  };

  const handleConfirmDeleteTable = async () => {
    if (!table) return;
    try {
      await deleteTable(table.id);
      setTable(null);
      setTableRows([]);
      setDeleteTableDialogOpen(false);
      fetchTable();
    } catch (error) {
      handleError(error, "删除表格失败");
    }
  };

  const handleAddColumn = () => {
    setNewColumnKey("");
    setNewColumnLabel("");
    setNewColumnType("text");
    setNewColumnOptions([]);
    setNewColumnDateFormat("YYYY/MM/DD");
    setNewColumnDefaultValue("");
    setIsAddColumnDialogOpen(true);
  };

  // 编辑列
  const handleEditColumn = (columnKey: string) => {
    const column = table?.columns.find(col => col.key === columnKey);
    if (!column) return;
    
    setEditingColumnKey(column.key);
    setEditingColumnLabel(column.label);
    setEditingColumnType(column.type || "text");
    
    // 如果是单选或多选，加载选项
    if (column.type === "single_select" || column.type === "multi_select") {
      const options = column.options?.options || [];
      setEditingColumnOptions(options.map((opt: string) => ({ key: opt, value: opt })));
    } else {
      setEditingColumnOptions([]);
    }
    
    // 如果是日期，加载格式
    if (column.type === "date") {
      setEditingColumnDateFormat(column.options?.format || "YYYY/MM/DD");
    } else {
      setEditingColumnDateFormat("YYYY/MM/DD");
    }
    
    // 加载默认值
    setEditingColumnDefaultValue(column.options?.defaultValue || "");
    
    setIsEditColumnDialogOpen(true);
  };

  // 保存编辑的列
  const handleSaveEditColumn = () => {
    if (!table) return;
    if (!editingColumnLabel.trim()) {
      handleError(new Error("请填写列名称"), "列名称不能为空");
      return;
    }

    // 如果是单选或多选，验证选项
    if (editingColumnType === "single_select" || editingColumnType === "multi_select") {
      // 过滤掉空值
      const validOptions = editingColumnOptions.filter(opt => opt.value.trim());
      
      if (validOptions.length === 0) {
        handleError(new Error("请至少添加一个选项"), "单选/多选类型需要至少一个选项");
        return;
      }
      
      // 检查选项值是否重复
      const optionValues = validOptions.map(opt => opt.value.trim());
      const uniqueValues = new Set(optionValues);
      if (optionValues.length !== uniqueValues.size) {
        handleError(new Error("选项值不能重复"), "选项值不能重复");
        return;
      }
      
      // 验证默认值是否在选项中
      if (editingColumnDefaultValue.trim()) {
        if (editingColumnType === "single_select") {
          // 单选：默认值必须在选项中
          if (!optionValues.includes(editingColumnDefaultValue.trim())) {
            handleError(new Error("默认值必须在选项中"), "默认值必须在选项列表中");
            return;
          }
        } else if (editingColumnType === "multi_select") {
          // 多选：默认值的每个值都必须在选项中
          const defaultValues = editingColumnDefaultValue.split(",").map(v => v.trim()).filter(v => v);
          const invalidValues = defaultValues.filter(v => !optionValues.includes(v));
          if (invalidValues.length > 0) {
            handleError(new Error("默认值中的某些值不在选项中"), `默认值 "${invalidValues.join(", ")}" 不在选项列表中`);
            return;
          }
        }
      }
    }

    // 更新列定义
    const updatedColumns = table.columns.map(col => {
      if (col.key === editingColumnKey) {
        const updatedCol: TableColumn = {
          ...col,
          label: editingColumnLabel.trim(),
          type: editingColumnType,
        };
        
        // 构建 options 对象
        const columnOptions: Record<string, any> = {};
        
        // 如果是单选或多选，更新选项
        if (editingColumnType === "single_select" || editingColumnType === "multi_select") {
          const validOptions = editingColumnOptions.filter(opt => opt.value.trim());
          columnOptions.options = validOptions.map(opt => opt.value.trim());
        }
        
        // 如果是日期，更新格式
        if (editingColumnType === "date") {
          columnOptions.format = editingColumnDateFormat;
        }
        
        // 如果有默认值，添加到 options
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
    
    // 更新本地表格状态
    setTable({
      ...table,
      columns: updatedColumns,
    });
    
    // 标记为有未保存的更改
    setHasUnsavedChanges(true);
    recordHistory(localRows, updatedColumns);
    
    // 关闭对话框并重置表单
    setIsEditColumnDialogOpen(false);
    setEditingColumnKey("");
    setEditingColumnLabel("");
    setEditingColumnType("text");
    setEditingColumnOptions([]);
    setEditingColumnDateFormat("YYYY/MM/DD");
    setEditingColumnDefaultValue("");
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
  
  // 记录历史状态
  const recordHistory = useCallback((rows: TableRowType[], columns: TableColumn[]) => {
    if (isUndoRedo) return;
    if (!historyInitializedRef.current) return;

    const newState: HistoryState = {
      rows: JSON.parse(JSON.stringify(rows)),
      columns: JSON.parse(JSON.stringify(columns)),
    };

    setHistory(prev => {
      const currentIndex = historyIndexRef.current;
      if (prev.length === 0) {
        const newHistory = [newState];
        const newIndex = 0;
        setHistoryIndex(newIndex);
        historyIndexRef.current = newIndex;
        return newHistory;
      }
      const newHistory = prev.slice(0, currentIndex + 1);
      newHistory.push(newState);
      if (newHistory.length > 50) newHistory.shift();
      const newIndex = newHistory.length - 1;
      setHistoryIndex(newIndex);
      historyIndexRef.current = newIndex;
      return newHistory;
    });
  }, [isUndoRedo]);

  // 撤销操作
  const handleUndo = useCallback(() => {
    const currentIndex = historyIndexRef.current; // 使用 ref 获取最新值
    if (currentIndex <= 0 || !table) return;
    
    setIsUndoRedo(true);
    const prevIndex = currentIndex - 1;
    const prevState = history[prevIndex];
    
    if (prevState) {
      setLocalRows(prevState.rows);
      setTable({
        ...table,
        columns: prevState.columns,
      });
      setHistoryIndex(prevIndex);
      historyIndexRef.current = prevIndex; // 同步更新 ref
      setHasUnsavedChanges(prevIndex !== 0); // 如果回到初始状态，标记为无未保存更改
    }
    
    setTimeout(() => setIsUndoRedo(false), 0);
  }, [history, table]);

  // 重做操作
  const handleRedo = useCallback(() => {
    const currentIndex = historyIndexRef.current; // 使用 ref 获取最新值
    if (currentIndex >= history.length - 1 || !table) return;
    
    setIsUndoRedo(true);
    const nextIndex = currentIndex + 1;
    const nextState = history[nextIndex];
    
    if (nextState) {
      setLocalRows(nextState.rows);
      setTable({
        ...table,
        columns: nextState.columns,
      });
      setHistoryIndex(nextIndex);
      historyIndexRef.current = nextIndex; // 同步更新 ref
      setHasUnsavedChanges(true);
    }
    
    setTimeout(() => setIsUndoRedo(false), 0);
  }, [history.length, history, table]);

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果正在输入，不触发快捷键
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      
      // Ctrl+Z 或 Cmd+Z: 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (historyIndex > 0 && !saving) {
          handleUndo();
        }
      }
      // Ctrl+Y 或 Ctrl+Shift+Z 或 Cmd+Shift+Z: 重做
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
    // 只更新本地状态，不立即保存到后端
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
      historyIndexRef.current = 0; // 同步更新 ref
    } catch (error) {
      handleError(error, "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRow = (row: TableRowType) => {
    if (!table) return;

    if (!historyInitializedRef.current && history.length === 0) {
      const initialState: HistoryState = {
        rows: JSON.parse(JSON.stringify(localRows)),
        columns: JSON.parse(JSON.stringify(table.columns)),
      };
      setHistory([initialState]);
      setHistoryIndex(0);
      historyIndexRef.current = 0;
      historyInitializedRef.current = true;
    }

    const newRows = localRows.map(r =>
      r.id === row.id ? { ...r, _deleted: true } : r
    );
    setLocalRows(newRows);
    setHasUnsavedChanges(true);
    recordHistory(newRows, table.columns);
  };

  // 删除列（只更新本地状态，保存时再同步到后端）
  const handleDeleteColumn = (columnKey: string) => {
    if (!table) return;

    // 从表格的 columns 中移除该列
    const updatedColumns = table.columns.filter(col => col.key !== columnKey);
    
    // 从本地行数据中移除该列的单元格
    const newRows = localRows.map(row => {
      const newCells = { ...row.cells };
      delete newCells[columnKey];
      return { ...row, cells: newCells };
    });
    
    // 更新本地表格状态
    setTable({
      ...table,
      columns: updatedColumns,
    });
    setLocalRows(newRows);
    
    setHasUnsavedChanges(true);
    recordHistory(newRows, updatedColumns);
  };

  const handleSearch = async () => {
    if (!table) return;
    try {
      setLoadingRows(true);
      const result = await searchTable({
        table_id: table.id,
        column_key: searchColumnKey || undefined,
        value: searchValue || undefined,
      });
      setTableRows(result.rows);
    } catch (error) {
      handleError(error, "搜索失败");
    } finally {
      setLoadingRows(false);
    }
  };

  const handleClearSearch = () => {
    setSearchColumnKey("");
    setSearchValue("");
    if (table) {
      fetchTableRows(table.id); // fetchTableRows 会重置初始化标志，useEffect 会处理初始化
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
    
    // 记录历史（使用当前的列定义，因为列定义已经在 handleImportColumns 中更新了）
    recordHistory(newRows, table.columns);
  }, [table, localRows, recordHistory]);

  return (
    <div className="h-full flex flex-col">
      
      {/* 电子表格式视图 - 直接显示，无需页面头部 */}
      <div className="rounded-lg border bg-card flex flex-col overflow-hidden flex-1 min-h-0 min-w-0">
        {/* 渲染模式切换按钮 */}
        {table && (
          <div className="flex items-center justify-end gap-2 p-2 border-b bg-muted/30 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">渲染模式:</span>
              <Button
                size="sm"
                variant={useCanvasMode ? "default" : "outline"}
                onClick={() => setUseCanvasMode(true)}
                className="h-7 text-xs"
              >
                Canvas（高性能）
              </Button>
              <Button
                size="sm"
                variant={!useCanvasMode ? "default" : "outline"}
                onClick={() => setUseCanvasMode(false)}
                className="h-7 text-xs"
              >
                DOM（标准）
              </Button>
            </div>
          </div>
        )}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            加载中...
          </div>
        ) : table ? (
          useCanvasMode ? (
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
          ) : (
            <SpreadsheetTableView
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
          )
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            加载中...
          </div>
        )}
      </div>

      {/* 删除表格确认对话框 */}
      <Dialog open={deleteTableDialogOpen} onOpenChange={setDeleteTableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除表格</DialogTitle>
            <DialogDescription>
              确定要删除表格 "{table?.name}" 吗？此操作将删除所有相关数据，且无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeleteTableDialogOpen(false)}
            >
              取消
            </Button>
            <Button 
              variant="destructive"
              onClick={handleConfirmDeleteTable}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加列对话框 */}
      <Dialog open={isAddColumnDialogOpen} onOpenChange={setIsAddColumnDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>添加列</DialogTitle>
            <DialogDescription>
              添加一个新的列到表格中
            </DialogDescription>
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
                disabled={savingColumn}
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
                disabled={savingColumn}
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
                  // 切换类型时重置选项、格式和默认值
                  if (value !== "single_select" && value !== "multi_select") {
                    setNewColumnOptions([]);
                  }
                  if (value !== "date") {
                    setNewColumnDateFormat("YYYY/MM/DD");
                  }
                  // 数据类型改变时清空默认值
                  setNewColumnDefaultValue("");
                }}
                disabled={savingColumn}
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
            
            {/* 选项配置（单选/多选） */}
            {(newColumnType === "single_select" || newColumnType === "multi_select") && (
              <div className="space-y-2">
                <Label>
                  选项配置 <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  至少需要添加一个选项，选项值不能为空且不能重复
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2 custom-scrollbar">
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
            
            {/* 日期格式选择 */}
            {newColumnType === "date" && (
              <div className="space-y-2">
                <Label>日期格式</Label>
                <Select
                  value={newColumnDateFormat}
                  onValueChange={(newFormat) => {
                    // 如果已有默认值，转换格式
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
            
            {/* 默认值 - 根据数据类型显示不同的输入控件 */}
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
                <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2 custom-scrollbar">
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
                  disabled={savingColumn}
                />
              ) : (
                <Input
                  value={newColumnDefaultValue}
                  onChange={(e) => setNewColumnDefaultValue(e.target.value)}
                  placeholder="可选，新建行时自动填充此值"
                  disabled={savingColumn}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddColumnDialogOpen(false)}
              disabled={savingColumn}
            >
              取消
            </Button>
            <Button onClick={handleSaveColumn} disabled={savingColumn}>
              {savingColumn ? "保存中..." : "保存"}
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
              <Label htmlFor="edit-column-key">
                Key
              </Label>
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
                  // 切换类型时重置选项、格式和默认值
                  if (value !== "single_select" && value !== "multi_select") {
                    setEditingColumnOptions([]);
                  }
                  if (value !== "date") {
                    setEditingColumnDateFormat("YYYY/MM/DD");
                  }
                  // 数据类型改变时清空默认值
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
            
            {/* 选项配置（单选/多选） */}
            {(editingColumnType === "single_select" || editingColumnType === "multi_select") && (
              <div className="space-y-2">
                <Label>
                  选项配置 <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  至少需要添加一个选项，选项值不能为空且不能重复
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2 custom-scrollbar">
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
            
            {/* 日期格式选择 */}
            {editingColumnType === "date" && (
              <div className="space-y-2">
                <Label>日期格式</Label>
                <Select
                  value={editingColumnDateFormat}
                  onValueChange={(newFormat) => {
                    // 如果已有默认值，转换格式
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
            
            {/* 默认值 - 根据数据类型显示不同的输入控件 */}
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
                <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2 custom-scrollbar">
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
              onClick={() => {
                setIsEditColumnDialogOpen(false);
                setEditingColumnKey("");
                setEditingColumnLabel("");
                setEditingColumnType("text");
              }}
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

export const TablesConfigClient = observer(TablesConfigClientImpl);
