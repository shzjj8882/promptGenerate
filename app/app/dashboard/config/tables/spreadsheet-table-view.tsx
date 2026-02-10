"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, X, Trash2, MoreVertical, Pencil, ChevronDownIcon, Undo2, Redo2, Save, Upload, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker, DATE_FORMATS } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import type { MultiDimensionTable, TableRow as TableRowType } from "@/lib/api/multi-dimension-tables";

interface SpreadsheetTableViewProps {
  table: MultiDimensionTable;
  rows: TableRowType[];
  loading?: boolean;
  onCellChange: (rowId: string, columnKey: string, value: string) => void;
  onAddRow: () => void;
  onAddColumn?: () => void;
  onDeleteColumn: (columnKey: string) => void;
  onEditColumn: (columnKey: string) => void;
  onDeleteRow?: (row: TableRowType) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onSave?: () => void;
  saving?: boolean;
  hasUnsavedChanges?: boolean;
  onImportRows?: (rows: TableRowType[], mode?: "append" | "replace") => void;
  onImportColumns?: (columns: Array<{ key: string; label: string; type?: string }>, mode?: "append" | "replace") => void;
}

export function SpreadsheetTableView({
  table,
  rows,
  loading = false,
  onCellChange,
  onAddRow,
  onAddColumn,
  onDeleteColumn,
  onEditColumn,
  onDeleteRow,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onSave,
  saving = false,
  hasUnsavedChanges = false,
  onImportRows,
  onImportColumns,
}: SpreadsheetTableViewProps) {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [deleteColumnDialogOpen, setDeleteColumnDialogOpen] = useState(false);
  const [columnToDelete, setColumnToDelete] = useState<{ key: string; label: string } | null>(null);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnKey: string } | null>(null);
  const [cellValue, setCellValue] = useState<string>("");
  const [multiSelectOpen, setMultiSelectOpen] = useState<{ rowId: string; columnKey: string } | null>(null);
  const [popoverWidth, setPopoverWidth] = useState<number>(200);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState<number>(0);
  const [resizeStartWidth, setResizeStartWidth] = useState<number>(0);
  const [rowHeight, setRowHeight] = useState<"low" | "medium" | "high">("low");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const multiSelectTriggerRef = useRef<HTMLButtonElement>(null);
  
  // 筛选相关状态
  type FilterOperator = "contains" | "equals" | "not_contains" | "not_equals" | "starts_with" | "ends_with";
  type FilterLogic = "and" | "or";
  
  interface FilterCondition {
    id: string;
    columnKey: string;
    operator: FilterOperator;
    value: string;
  }
  
  interface FilterGroup {
    id: string;
    logic: FilterLogic; // 组内条件的逻辑（AND/OR）
    groupLogic?: FilterLogic; // 和前一个组的关系（AND/OR），第一个组没有此字段
    conditions: FilterCondition[];
  }
  
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // 当开始编辑单元格时，聚焦输入框
  useEffect(() => {
    if (editingCell) {
      // 延迟聚焦，确保 DOM 已更新
      const timer = setTimeout(() => {
        // 根据行高决定使用哪个 ref
        const element = rowHeight === "low" 
          ? (inputRef.current as HTMLInputElement | null)
          : (textareaRef.current as HTMLTextAreaElement | null);
        
        if (element) {
          element.focus();
          // 将光标移到末尾，允许连续输入
          if (element instanceof HTMLInputElement && element.type !== 'number') {
            const length = element.value.length;
            element.setSelectionRange(length, length);
          } else if (element instanceof HTMLTextAreaElement) {
            const length = element.value.length;
            element.setSelectionRange(length, length);
          }
        }
      }, 0);
      
      return () => clearTimeout(timer);
    }
  }, [editingCell, rowHeight]);

  const handleCellClick = (rowId: string, columnKey: string, currentValue: string) => {
    const column = table.columns.find(col => col.key === columnKey);
    setEditingCell({ rowId, columnKey });
    setCellValue(currentValue || "");
    // 如果是多选类型，打开下拉框
    if (column?.type === "multi_select") {
      setMultiSelectOpen({ rowId, columnKey });
    } else {
      setMultiSelectOpen(null);
    }
  };

  const handleCellBlur = () => {
    if (editingCell) {
      onCellChange(editingCell.rowId, editingCell.columnKey, cellValue);
      setEditingCell(null);
      setCellValue("");
    }
  };

  // 根据列类型渲染不同的输入控件
  const renderCellEditor = (col: typeof table.columns[0]) => {
    const columnType = col.type || "text";
    
    switch (columnType) {
      case "number":
        return (
          <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="number"
            value={cellValue}
            onChange={(e) => setCellValue(e.target.value)}
            onBlur={handleCellBlur}
            onKeyDown={handleCellKeyDown}
            className="h-full w-full border-0 rounded-none focus-visible:ring-0 p-2"
          />
        );
      
      case "date":
        const dateFormat = col.options?.format || "YYYY/MM/DD";
        return (
          <div className="h-full w-full p-1">
            <DatePicker
              value={cellValue}
              onChange={(value) => {
                setCellValue(value);
                handleCellBlur();
              }}
              format={dateFormat}
              className="h-full"
            />
          </div>
        );
      
      case "single_select":
        const singleOptions = col.options?.options || [];
        if (singleOptions.length === 0) {
          return (
            <div className="h-full w-full p-2 text-sm text-muted-foreground">
              请先配置选项
            </div>
          );
        }
        return (
          <Select
            value={cellValue}
            onValueChange={(value) => {
              setCellValue(value);
              handleCellBlur();
            }}
          >
            <SelectTrigger className="h-full w-full border-0 rounded-none focus:ring-0 min-w-[200px]">
              <SelectValue placeholder="请选择" />
            </SelectTrigger>
            <SelectContent className="min-w-[200px]">
              {singleOptions
                .filter((option: string) => option && option.trim())
                .map((option: string) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        );
      
      case "multi_select":
        const multiOptions = col.options?.options || [];
        const selectedValues = cellValue ? cellValue.split(",").filter(v => v) : [];
        const filteredOptions = multiOptions.filter((option: string) => option && option.trim());
        const isMultiSelectOpen = multiSelectOpen?.rowId === editingCell?.rowId && multiSelectOpen?.columnKey === editingCell?.columnKey;
        
        if (filteredOptions.length === 0) {
          return (
            <div className="h-full w-full p-2 text-sm text-muted-foreground">
              请先配置选项
            </div>
          );
        }
        
        const displayText = selectedValues.length > 0 
          ? selectedValues.join(", ") 
          : "请选择";
        
        return (
          <Popover open={isMultiSelectOpen} onOpenChange={(open) => {
            if (open) {
              setMultiSelectOpen({ rowId: editingCell!.rowId, columnKey: editingCell!.columnKey });
              // 使用 setTimeout 确保 DOM 已更新
              setTimeout(() => {
                if (multiSelectTriggerRef.current) {
                  const width = multiSelectTriggerRef.current.offsetWidth;
                  setPopoverWidth(width);
                }
              }, 0);
            } else {
              setMultiSelectOpen(null);
              // 关闭时保存更改
              if (editingCell) {
                onCellChange(editingCell.rowId, editingCell.columnKey, cellValue);
              }
            }
          }}>
            <PopoverTrigger asChild>
              <button
                ref={multiSelectTriggerRef}
                type="button"
                onClick={() => {
                  // 点击时获取宽度
                  if (multiSelectTriggerRef.current) {
                    const width = multiSelectTriggerRef.current.offsetWidth;
                    setPopoverWidth(width);
                  }
                }}
                className={cn(
                  "h-full w-full flex items-center justify-between gap-2 rounded-none border-0 bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
                  selectedValues.length === 0 && "text-muted-foreground"
                )}
              >
                <span className="truncate flex-1 text-left">{displayText}</span>
                <ChevronDownIcon className="h-4 w-4 opacity-50 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-1" align="start" style={{ width: `${popoverWidth}px`, minWidth: `${popoverWidth}px` }}>
              <div className="max-h-60 overflow-y-auto">
                {filteredOptions.map((option: string) => (
                  <div
                    key={option}
                    className={cn(
                      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pr-8 pl-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-accent"
                    )}
                    onClick={() => {
                      const isChecked = selectedValues.includes(option);
                      let newValues: string[];
                      if (isChecked) {
                        newValues = selectedValues.filter(v => v !== option);
                      } else {
                        newValues = [...selectedValues, option];
                      }
                      setCellValue(newValues.join(","));
                      // 不关闭下拉框，允许继续选择
                    }}
                  >
                    <div className="absolute left-2 flex h-4 w-4 items-center justify-center">
                      <Checkbox
                        checked={selectedValues.includes(option)}
                        onCheckedChange={(checked) => {
                          const isChecked = selectedValues.includes(option);
                          let newValues: string[];
                          if (checked && !isChecked) {
                            newValues = [...selectedValues, option];
                          } else if (!checked && isChecked) {
                            newValues = selectedValues.filter(v => v !== option);
                          } else {
                            return;
                          }
                          setCellValue(newValues.join(","));
                          // 不关闭下拉框，允许继续选择
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <span className="flex-1">{option}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        );
      
      default: // text
        // 当行高不是"low"时，使用 Textarea 支持多行输入
        if (rowHeight !== "low") {
          return (
            <Textarea
              ref={textareaRef}
              value={cellValue}
              onChange={(e) => setCellValue(e.target.value)}
              onBlur={handleCellBlur}
              onKeyDown={handleCellKeyDown}
              className={cn(
                "w-full border-0 rounded-none focus-visible:ring-0 resize-none p-2",
                rowHeight === "medium" && "min-h-[64px]",
                rowHeight === "high" && "min-h-[96px]"
              )}
              rows={rowHeight === "medium" ? 2 : rowHeight === "high" ? 3 : 1}
            />
          );
        }
        
        return (
          <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={cellValue}
            onChange={(e) => setCellValue(e.target.value)}
            onBlur={handleCellBlur}
            onKeyDown={handleCellKeyDown}
            className="h-full w-full border-0 rounded-none focus-visible:ring-0 p-2"
          />
        );
    }
  };
  
  // 格式化显示值
  const formatDisplayValue = (value: string, col: typeof table.columns[0]) => {
    if (!value) return null;
    
    const columnType = col.type || "text";
    
    switch (columnType) {
      case "date":
        // 日期值已经是格式化后的字符串，直接显示
        return value;
      
      case "multi_select":
        // 多选值用逗号分隔，显示时用逗号和空格分隔
        return value.split(",").filter(v => v).join(", ");
      
      default:
        return value;
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCellBlur();
    } else if (e.key === "Escape") {
      setEditingCell(null);
      setCellValue("");
    }
  };

  // 列宽拖拽处理
  const handleResizeStart = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnKey);
    setResizeStartX(e.clientX);
    const currentWidth = columnWidths[columnKey] || 150;
    setResizeStartWidth(currentWidth);
  };

  useEffect(() => {
    const handleResizeMove = (e: MouseEvent) => {
      if (!resizingColumn) return;
      
      const diff = e.clientX - resizeStartX;
      const newWidth = Math.max(50, resizeStartWidth + diff); // 最小宽度 50px
      
      setColumnWidths(prev => ({
        ...prev,
        [resizingColumn]: newWidth,
      }));
    };

    const handleResizeEnd = () => {
      setResizingColumn(null);
    };

    if (resizingColumn) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth]);

  // 处理文件导入的函数
  const handleFileImport = useCallback(async (file: File) => {
    try {
      // 动态导入 xlsx 库
      const XLSX = await import("xlsx");
      
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          
          // 读取第一个工作表
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // 转换为 JSON（第一行作为标题）
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1,
            defval: ""
          }) as any[][];
          
          if (jsonData.length < 2) {
            setErrorMessage("Excel 文件至少需要包含标题行和一行数据");
            setErrorDialogOpen(true);
            return;
          }
          
          // 第一行是标题
          const headers = (jsonData[0] as any[])?.filter(h => h !== null && h !== undefined && String(h).trim() !== "") || [];
          
          if (headers.length === 0) {
            setErrorMessage("Excel 文件的第一行（标题行）为空，请检查文件格式");
            setErrorDialogOpen(true);
            return;
          }
          
          console.log("Excel 标题行:", headers);
          console.log("表格现有列:", table.columns.map(col => ({ key: col.key, label: col.label })));
          
          // 辅助函数：从label生成key（将中文和特殊字符转换为安全的key）
          const generateKeyFromLabel = (label: string, existingKeys: Set<string>): string => {
            // 先尝试直接使用label（如果已经是有效的key格式）
            let key = label.trim();
            
            // 如果label已经是有效的key（只包含字母、数字、下划线），直接使用
            if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
              // 检查是否已存在
              if (!existingKeys.has(key)) {
                return key;
              }
            }
            
            // 否则生成一个基于label的key
            // 将中文和特殊字符转换为下划线分隔的格式
            key = key
              .replace(/[^\w\s-]/g, '') // 移除特殊字符
              .replace(/\s+/g, '_') // 空格转下划线
              .replace(/_+/g, '_') // 多个下划线合并为一个
              .replace(/^_|_$/g, '') // 移除首尾下划线
              .toLowerCase();
            
            // 如果key为空或不是以字母或下划线开头，添加前缀
            if (!key || !/^[a-zA-Z_]/.test(key)) {
              key = 'col_' + key;
            }
            
            // 确保key唯一
            let finalKey = key;
            let counter = 1;
            while (existingKeys.has(finalKey)) {
              finalKey = `${key}_${counter}`;
              counter++;
            }
            
            return finalKey;
          };
          
          // 创建列名到表格列 key 的映射
          const columnMap: Record<string, string> = {};
          const newColumns: Array<{ key: string; label: string; type?: string }> = [];
          const existingKeys = new Set(table.columns.map(col => col.key));
          
          // 辅助函数：标准化字符串用于匹配（去除空格、转小写）
          const normalize = (str: string | null | undefined): string => {
            if (!str) return "";
            return String(str).trim().toLowerCase();
          };
          
          // 为Excel中的每个列创建映射
          headers.forEach(header => {
            const headerStr = String(header || "").trim();
            if (!headerStr) return;
            
            // 尝试匹配现有列
            let matched = false;
            for (const col of table.columns) {
              const normalizedHeader = normalize(headerStr);
              const normalizedLabel = normalize(col.label);
              const normalizedKey = normalize(col.key);
              
              // 完全匹配或标准化后匹配
              if (
                headerStr === col.label ||
                headerStr === col.key ||
                normalizedHeader === normalizedLabel ||
                normalizedHeader === normalizedKey ||
                headerStr.trim() === col.label.trim() ||
                headerStr.trim() === col.key.trim()
              ) {
                columnMap[headerStr] = col.key;
                matched = true;
                console.log(`匹配现有列: Excel列"${headerStr}" -> 表格列"${col.label}"(${col.key})`);
                break;
              }
            }
            
            // 如果没有匹配到现有列，创建新列
            if (!matched) {
              const newKey = generateKeyFromLabel(headerStr, existingKeys);
              columnMap[headerStr] = newKey;
              existingKeys.add(newKey); // 添加到现有keys集合，避免重复
              newColumns.push({
                key: newKey,
                label: headerStr,
                type: "text", // 默认类型为文本
              });
              console.log(`创建新列: Excel列"${headerStr}" -> 新列key"${newKey}"`);
            }
          });
          
          // 如果有新列需要创建，先创建列
          if (newColumns.length > 0 && onImportColumns) {
            console.log("创建新列:", newColumns);
            onImportColumns(newColumns);
            // 注意：这里假设列已经创建，但实际上可能需要等待列创建完成
            // 为了简化，我们假设列会立即创建，如果实际需要等待，可以改为异步处理
          }
          
          // 转换数据行
          const importedRows: TableRowType[] = [];
          const maxRowId = rows.length > 0 
            ? Math.max(...rows.map(r => r.row_id >= 0 ? r.row_id : -1), -1)
            : -1;
          
          for (let i = 1; i < jsonData.length; i++) {
            const rowData = jsonData[i] as any[];
            
            // 跳过完全空行
            if (!rowData || rowData.every(cell => cell === null || cell === undefined || String(cell).trim() === "")) {
              continue;
            }
            
            const cells: Record<string, string> = {};
            
            headers.forEach((header, index) => {
              const columnKey = columnMap[String(header || "").trim()];
              if (columnKey && rowData && rowData[index] !== undefined && rowData[index] !== null) {
                const cellValue = String(rowData[index] || "").trim();
                // 即使值为空也保留，因为可能是空字符串
                cells[columnKey] = cellValue;
              }
            });
            
            // 只有当至少有一个单元格有数据时才添加行
            if (Object.keys(cells).length > 0) {
              const tempRowId = `temp-import-${Date.now()}-${i}`;
              
              importedRows.push({
                id: tempRowId,
                table_id: table.id,
                row_id: maxRowId + importedRows.length + 1,
                cells,
                row_data: undefined,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
          }
          
          if (importedRows.length > 0) {
            if (onImportRows) {
              onImportRows(importedRows);
            }
            setImportDialogOpen(false);
            if (fileInputRef.current) {
              fileInputRef.current.value = "";
            }
            
            const newColumnsInfo = newColumns.length > 0 
              ? `\n\n已自动创建 ${newColumns.length} 个新列：${newColumns.map(col => col.label).join(", ")}`
              : "";
            setSuccessMessage(`成功导入 ${importedRows.length} 行数据，共 ${headers.length} 个列。${newColumnsInfo}`);
            setSuccessDialogOpen(true);
          } else {
            setErrorMessage("没有找到可导入的数据。请检查Excel文件是否包含数据行。");
            setErrorDialogOpen(true);
          }
        } catch (error) {
          console.error("解析 Excel 文件失败:", error);
          setErrorMessage("解析 Excel 文件失败，请检查文件格式");
          setErrorDialogOpen(true);
        }
      };
      
      reader.onerror = () => {
        setErrorMessage("读取文件失败");
        setErrorDialogOpen(true);
      };
      
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error("导入 xlsx 库失败:", error);
      setErrorMessage("请先安装 xlsx 库：pnpm add xlsx");
      setErrorDialogOpen(true);
    }
  }, [table, rows, onImportRows, onImportColumns]);

  // 判断单个条件是否满足
  const checkCondition = useCallback((row: TableRowType, condition: FilterCondition): boolean => {
    const cellValue = String(row.cells[condition.columnKey] || "").toLowerCase();
    const filterValue = condition.value.toLowerCase();
    
    // 如果筛选值为空，跳过该条件
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

  // 判断单个组是否满足条件
  const checkGroup = useCallback((row: TableRowType, group: FilterGroup): boolean => {
    if (group.conditions.length === 0) return true;
    
    // 过滤掉值为空的条件
    const validConditions = group.conditions.filter(c => c.value.trim());
    if (validConditions.length === 0) return true;
    
    // 根据组的逻辑（AND/OR）判断条件
    if (group.logic === "and") {
      // AND: 所有条件都必须满足
      return validConditions.every(condition => checkCondition(row, condition));
    } else {
      // OR: 至少一个条件满足即可
      return validConditions.some(condition => checkCondition(row, condition));
    }
  }, [checkCondition]);

  // 应用筛选条件
  const applyFilter = useCallback((row: TableRowType, groups: FilterGroup[]): boolean => {
    if (groups.length === 0) return true;
    
    // 第一个组的结果
    let result = checkGroup(row, groups[0]);
    
    // 从第二个组开始，根据组间逻辑组合结果
    for (let i = 1; i < groups.length; i++) {
      const group = groups[i];
      const groupResult = checkGroup(row, group);
      const groupLogic = group.groupLogic || "and"; // 默认为 AND
      
      if (groupLogic === "and") {
        // AND: 两个结果都必须为 true
        result = result && groupResult;
      } else {
        // OR: 至少一个为 true
        result = result || groupResult;
      }
    }
    
    return result;
  }, [checkGroup]);

  // 获取筛选后的行数据
  const filteredRows = rows.filter(row => applyFilter(row, filterGroups));

  // 添加筛选条件组
  const addFilterGroup = () => {
    const newGroup: FilterGroup = {
      id: `group-${Date.now()}`,
      logic: "and", // 组内条件默认是 AND
      groupLogic: filterGroups.length > 0 ? "and" : undefined, // 如果有其他组，默认和前一个组是 AND 关系
      conditions: [{
        id: `condition-${Date.now()}`,
        columnKey: table.columns[0]?.key || "",
        operator: "contains",
        value: "",
      }],
    };
    setFilterGroups([...filterGroups, newGroup]);
  };

  // 添加筛选条件
  const addFilterCondition = (groupId: string) => {
    setFilterGroups(groups =>
      groups.map(group =>
        group.id === groupId
          ? {
              ...group,
              conditions: [
                ...group.conditions,
                {
                  id: `condition-${Date.now()}`,
                  columnKey: table.columns[0]?.key || "",
                  operator: "contains",
                  value: "",
                },
              ],
            }
          : group
      )
    );
  };

  // 删除筛选条件组
  const removeFilterGroup = (groupId: string) => {
    setFilterGroups(groups => groups.filter(g => g.id !== groupId));
  };

  // 删除筛选条件
  const removeFilterCondition = (groupId: string, conditionId: string) => {
    setFilterGroups(groups =>
      groups.map(group =>
        group.id === groupId
          ? {
              ...group,
              conditions: group.conditions.filter(c => c.id !== conditionId),
            }
          : group
      )
    );
  };

  // 更新筛选条件
  const updateFilterCondition = (
    groupId: string,
    conditionId: string,
    updates: Partial<FilterCondition>
  ) => {
    setFilterGroups(groups =>
      groups.map(group =>
        group.id === groupId
          ? {
              ...group,
              conditions: group.conditions.map(c =>
                c.id === conditionId ? { ...c, ...updates } : c
              ),
            }
          : group
      )
    );
  };

  // 更新筛选组逻辑（组内条件逻辑）
  const updateFilterGroupLogic = (groupId: string, logic: FilterLogic) => {
    setFilterGroups(groups =>
      groups.map(group =>
        group.id === groupId ? { ...group, logic } : group
      )
    );
  };

  // 更新筛选组间逻辑（和前一个组的关系）
  const updateFilterGroupLogicBetween = (groupId: string, groupLogic: FilterLogic) => {
    setFilterGroups(groups =>
      groups.map(group =>
        group.id === groupId ? { ...group, groupLogic } : group
      )
    );
  };

  // 清除所有筛选
  const clearAllFilters = () => {
    setFilterGroups([]);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 p-2 border-b bg-muted/50 shrink-0">
        <Button size="sm" variant="outline" onClick={onAddRow}>
          <Plus className="h-4 w-4 mr-1" />
          添加记录
        </Button>
        {onUndo && (
          <Button 
            size="sm" 
            variant="outline" 
            onClick={onUndo}
            disabled={!canUndo}
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4 mr-1" />
            撤销
          </Button>
        )}
        {onRedo && (
          <Button 
            size="sm" 
            variant="outline" 
            onClick={onRedo}
            disabled={!canRedo}
            title="重做 (Ctrl+Y)"
          >
            <Redo2 className="h-4 w-4 mr-1" />
            重做
          </Button>
        )}
        {/* 行高控制 */}
        <div className="flex items-center gap-2 ml-2">
          <span className="text-sm text-muted-foreground">行高:</span>
          <Select value={rowHeight} onValueChange={(value: "low" | "medium" | "high") => setRowHeight(value)}>
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">低</SelectItem>
              <SelectItem value="medium">中等</SelectItem>
              <SelectItem value="high">高</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* 保存按钮 - 一直存在 */}
        <div className="flex items-center gap-2 ml-auto">
          {/* 筛选按钮 */}
          <Button
            size="sm"
            variant={filterGroups.length > 0 ? "default" : "outline"}
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            筛选
            {filterGroups.length > 0 && (
              <span className="ml-1 bg-primary-foreground text-primary px-1.5 py-0.5 rounded text-xs">
                {filterGroups.reduce((sum, g) => sum + g.conditions.length, 0)}
              </span>
            )}
          </Button>
          {onImportRows && (
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setImportDialogOpen(true)}
            >
              <Upload className="h-4 w-4 mr-1" />
              导入 Excel
            </Button>
          )}
          {onSave && (
            <Button
              size="sm"
              onClick={onSave}
              disabled={saving || !hasUnsavedChanges}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? "保存中..." : "保存"}
            </Button>
          )}
        </div>
      </div>

      {/* 筛选面板 */}
      {showFilterPanel && (
        <div className="border-b bg-background p-4 shrink-0">
          <div className="space-y-4">
            {filterGroups.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                暂无筛选条件，点击"添加筛选组"开始筛选
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
                            value={group.groupLogic || "and"}
                            onValueChange={(value: FilterLogic) => updateFilterGroupLogicBetween(group.id, value)}
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
                        onValueChange={(value: FilterLogic) => updateFilterGroupLogic(group.id, value)}
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
                      onClick={() => removeFilterGroup(group.id)}
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
                          onValueChange={(value) =>
                            updateFilterCondition(group.id, condition.id, { columnKey: value })
                          }
                        >
                          <SelectTrigger className="w-40 h-8">
                            <SelectValue placeholder="选择列" />
                          </SelectTrigger>
                          <SelectContent>
                            {table.columns.map((col) => (
                              <SelectItem key={col.key} value={col.key}>
                                {col.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={condition.operator}
                          onValueChange={(value: FilterOperator) =>
                            updateFilterCondition(group.id, condition.id, { operator: value })
                          }
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
                          onChange={(e) =>
                            updateFilterCondition(group.id, condition.id, { value: e.target.value })
                          }
                          placeholder="输入值"
                          className="flex-1 h-8"
                        />
                        {group.conditions.length > 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeFilterCondition(group.id, condition.id)}
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addFilterCondition(group.id)}
                      className="ml-14 h-7"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      添加条件
                    </Button>
                  </div>
                </div>
              ))
            )}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={addFilterGroup}>
                <Plus className="h-4 w-4 mr-1" />
                添加筛选组
              </Button>
              {filterGroups.length > 0 && (
                <Button size="sm" variant="outline" onClick={clearAllFilters}>
                  清除所有筛选
                </Button>
              )}
              <div className="ml-auto text-sm text-muted-foreground">
                显示 {filteredRows.length} / {rows.length} 条记录
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 表格内容 */}
      <div className="flex-1 overflow-y-auto overflow-x-auto relative min-h-0 custom-scrollbar">
        <div className="inline-block min-w-full">
          <table className="border-collapse">
            <thead className="sticky top-0 z-20 bg-muted shadow-sm">
              <tr>
                {/* 第一列：checkbox + id（自动显示） */}
                <th className="border border-border p-2 min-w-[120px] bg-muted">
                  <div className="flex items-center gap-2">
                    <Checkbox className="w-4 h-4" />
      
                    <span>id</span>
                  </div>
                </th>
                {/* 其他列头 */}
                {table.columns.map((col) => {
                  const columnWidth = columnWidths[col.key] || 150;
                  return (
                    <th 
                      key={col.key} 
                      className="border border-border p-2 bg-muted relative"
                      style={{ width: `${columnWidth}px`, minWidth: `${columnWidth}px` }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex-1 truncate">{col.label}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 hover:bg-muted shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditColumn(col.key);
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setColumnToDelete({ key: col.key, label: col.label });
                                setDeleteColumnDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {/* 列宽调整手柄 */}
                      <div
                        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50 transition-colors"
                        onMouseDown={(e) => handleResizeStart(e, col.key)}
                        style={{ zIndex: 10 }}
                      />
                    </th>
                  );
                })}
                {/* 添加列按钮：在表头最后一列，无边框 */}
                {onAddColumn && (
                  <th className="p-2 w-12 bg-muted border-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 border-0"
                      onClick={onAddColumn}
                      title="添加列"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </th>
                )}
                {/* 删除按钮列的表头（如果需要） */}
                {onDeleteRow && (
                  <th className="p-0 w-0 border-0 bg-muted"></th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={table.columns.length + 1} className="border border-border p-8 text-center text-muted-foreground">
                    加载中...
                  </td>
                  {/* 删除按钮列的空单元格（如果有） */}
                  {onDeleteRow && (
                    <td className="p-0 w-0 border-0"></td>
                  )}
                  {/* 添加列按钮列的空单元格（保持表格结构一致，只在有添加列按钮时显示） */}
                  {onAddColumn && (
                    <td className="p-0 w-12 border-0"></td>
                  )}
                </tr>
              ) : (() => {
                // 应用筛选条件并过滤掉已标记删除的行
                const visibleRows = filteredRows.filter(row => !(row as any)._deleted);
                return visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={table.columns.length + 1} className="border border-border p-8 text-center text-muted-foreground">
                      暂无数据
                    </td>
                    {/* 删除按钮列的空单元格（如果有） */}
                    {onDeleteRow && (
                      <td className="p-0 w-0 border-0"></td>
                    )}
                    {/* 添加列按钮列的空单元格（保持表格结构一致，只在有添加列按钮时显示） */}
                    {onAddColumn && (
                      <td className="p-0 w-12 border-0"></td>
                    )}
                  </tr>
                ) : (
                  visibleRows.map((row, rowIndex) => (
                  <tr key={row.id} className="group relative hover:bg-muted/30 transition-colors">
                    {/* 第一列：checkbox + id（自动显示） */}
                    <td className="border border-border p-2 bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Checkbox className="w-4 h-4" />
                        <span>{row.row_id}</span>
                      </div>
                    </td>
                    {/* 其他单元格 */}
                    {table.columns.map((col) => {
                      const isEditing = editingCell?.rowId === row.id && editingCell?.columnKey === col.key;
                      const displayValue = row.cells[col.key] || "";
                      const columnWidth = columnWidths[col.key] || 150;

                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "border border-border p-0",
                            isEditing && "bg-blue-50 dark:bg-blue-950",
                            // 编辑状态下也应用行高样式
                            isEditing && rowHeight === "low" && "min-h-[32px]",
                            isEditing && rowHeight === "medium" && "min-h-[64px]",
                            isEditing && rowHeight === "high" && "min-h-[96px]"
                          )}
                          style={{ width: `${columnWidth}px`, minWidth: `${columnWidth}px` }}
                        >
                          {isEditing ? (
                            <div className={cn(
                              "h-full w-full flex items-start",
                              rowHeight === "low" && "min-h-[32px]",
                              rowHeight === "medium" && "min-h-[64px]",
                              rowHeight === "high" && "min-h-[96px]"
                            )}>
                              {renderCellEditor(col)}
                            </div>
                          ) : (
                            <div 
                              className={cn(
                                "p-2 w-full cursor-pointer hover:bg-muted/50 overflow-hidden",
                                rowHeight === "low" && "min-h-[32px]",
                                rowHeight === "medium" && "min-h-[64px]",
                                rowHeight === "high" && "min-h-[96px]"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCellClick(row.id, col.key, displayValue);
                              }}
                            >
                              <div className={cn(
                                "break-words overflow-hidden",
                                rowHeight === "low" && "line-clamp-1",
                                rowHeight === "medium" && "line-clamp-2",
                                rowHeight === "high" && "line-clamp-3"
                              )}>
                                {formatDisplayValue(displayValue, col) || <span className="text-muted-foreground">点击编辑</span>}
                              </div>
                            </div>
                              )}
                        </td>
                      );
                    })}
                    {/* 删除按钮：悬浮在行最右侧（hover 时显示，不是表格列） */}
                    {onDeleteRow && (
                      <td className="p-0 w-0 relative border-0">
                        <div className="absolute right-1/2 top-1/2 -translate-y-1/2 translate-x-1/2 z-20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 bg-background/90 shadow-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteRow(row);
                            }}
                            title="删除这一行"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                  ))
                );
              })()}
            </tbody>
            <tfoot>
              <tr>
                {/* 添加行按钮：跨越所有数据列（不包括删除按钮列和添加列按钮列） */}
                <td 
                  colSpan={table.columns.length + 1} 
                  className="border border-border p-2 bg-muted/30"
                >
                  <Button
                    variant="ghost"
                    onClick={onAddRow}
                    className="w-full text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    添加行
                  </Button>
                </td>
                {/* 删除按钮列的空单元格（如果有） */}
                {onDeleteRow && (
                  <td className="p-0 w-0 border-0"></td>
                )}
                {/* 添加列按钮列的空单元格（保持表格结构一致，只在有添加列按钮时显示） */}
                {onAddColumn && (
                  <td className="p-0 w-12 border-0"></td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 删除列确认对话框 */}
      <Dialog open={deleteColumnDialogOpen} onOpenChange={setDeleteColumnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除列</DialogTitle>
            <DialogDescription>
              确定要删除列 "{columnToDelete?.label}" 吗？此操作将删除该列的所有数据，且无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteColumnDialogOpen(false);
                setColumnToDelete(null);
              }}
            >
              取消
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                if (columnToDelete) {
                  onDeleteColumn(columnToDelete.key);
                  setDeleteColumnDialogOpen(false);
                  setColumnToDelete(null);
                }
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excel 导入对话框 */}
      {onImportRows && (
        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>导入 Excel 文件</DialogTitle>
              <DialogDescription>
                <div className="space-y-3 mt-2">
                  <div>
                    <p className="font-medium mb-1">导入规则：</p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>第一行将作为列标题</li>
                      <li>支持的格式：.xlsx, .xls</li>
                      <li>导入的数据将追加到现有数据之后</li>
                      <li>如果 Excel 中的列名与表格列名匹配，数据将自动映射</li>
                      <li>不匹配的列将被忽略</li>
                    </ul>
                  </div>
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* 拖拽上传区域 */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                  isDragging 
                    ? "border-primary bg-primary/5" 
                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                  
                  const files = e.dataTransfer.files;
                  if (files.length > 0) {
                    const file = files[0];
                      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                        await handleFileImport(file);
                      } else {
                        setErrorMessage("请选择 .xlsx 或 .xls 格式的文件");
                        setErrorDialogOpen(true);
                      }
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">
                  {isDragging ? "松开鼠标以导入文件" : "点击或拖拽文件到这里"}
                </p>
                <p className="text-sm text-muted-foreground">
                  支持 .xlsx 和 .xls 格式
                </p>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await handleFileImport(file);
                }}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                取消
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 错误提示对话框 */}
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>错误</DialogTitle>
            <DialogDescription>
              {errorMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorDialogOpen(false)}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 成功提示对话框 */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入成功</DialogTitle>
            <DialogDescription className="whitespace-pre-line">
              {successMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setSuccessDialogOpen(false)}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
