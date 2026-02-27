"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { Plus, X, Trash2, MoreVertical, Pencil, ChevronDownIcon, Undo2, Redo2, Save, Upload, Filter, Search } from "lucide-react";
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
import { ResponsiveMenu } from "@/components/ui/responsive-menu";
import { ResponsivePopover } from "@/components/ui/responsive-popover";
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
import { useTheme } from "@/components/shared/theme-provider";
import {
  createCanvasGridRenderer,
  type GridColumn,
  type GridRow,
  type CanvasGridRendererInstance,
} from "@/lib/canvas-grid-renderer";
import type { MultiDimensionTable, TableRow as TableRowType } from "@/lib/api/multi-dimension-tables";
import { filterNonDeletedRows } from "@/lib/utils/table-rows";
import { generateKeyFromLabel, normalize } from "@/lib/utils/string";
import { parseExcelFile, ExcelParseError } from "@/lib/utils/excel-parser";

interface CanvasSpreadsheetTableViewProps {
  table: MultiDimensionTable;
  rows: TableRowType[];
  loading?: boolean;
  /** 表头吸顶：为 true 时垂直滚动时表头固定在顶部 */
  stickyHeader?: boolean;
  onCellChange: (rowId: string, columnKey: string, value: string) => void;
  onAddRow: () => void;
  onAddColumn?: () => void;
  onDeleteColumn: (columnKey: string) => void;
  onEditColumn: (columnKey: string) => void;
  onEditRow?: (row: TableRowType) => void;
  onDeleteRow?: (row: TableRowType) => void;
  onEditByCondition?: () => void;
  onDeleteByCondition?: () => void;
  onQueryByCondition?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onSave?: () => void;
  saving?: boolean;
  hasUnsavedChanges?: boolean;
  onImportRows?: (rows: TableRowType[], mode?: "append" | "replace") => void;
  onImportColumns?: (columns: Array<{ key: string; label: string; type?: string; defaultValue?: string }>, mode?: "append" | "replace") => void;
}

// 渲染配置常量（业务层使用）
const CELL_HEIGHT = 40;
const HEADER_HEIGHT = 40;
const ID_COLUMN_KEY = "__id__";
const DEFAULT_COLUMN_WIDTH = 150;
const DEFAULT_ID_COLUMN_WIDTH = 120;

/** 多维表格业务：格式化单元格显示值 */
function formatTableCellValue(value: string, columnType?: string): string {
  if (!value) return "";
  if (columnType === "date") return value;
  if (columnType === "multi_select") {
    return [...new Set(value.split(/[,\s]+/).map((v) => v.trim()).filter((v) => v))].join(", ");
  }
  return value;
}

/** 将业务数据适配为渲染器所需的 GridColumn[] */
function toGridColumns(table: MultiDimensionTable, columnWidths: Record<string, number>): GridColumn[] {
  return (table?.columns || []).map((col) => ({
    key: col.key,
    width: columnWidths[col.key] ?? DEFAULT_COLUMN_WIDTH,
    headerLabel: col.label,
  }));
}

/** 将业务数据适配为渲染器所需的 GridRow[]（业务格式化在适配层完成） */
function toGridRows(rows: TableRowType[], table: MultiDimensionTable): GridRow[] {
  const colTypes = Object.fromEntries((table?.columns || []).map((c) => [c.key, c.type]));
  return rows.map((row) => ({
    getCellValue: (columnKey: string) =>
      formatTableCellValue(row.cells[columnKey] ?? "", colTypes[columnKey]),
    getRowId: () => row.row_id,
  }));
}

/** 创建 React 场景的渲染器配置（柯里化 + Tailwind 主题） */
const getSpreadsheetRendererConfig = (themeElement: () => HTMLElement | null) =>
  createCanvasGridRenderer({
    cellHeight: CELL_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    idColumnKey: ID_COLUMN_KEY,
    idColumnWidth: DEFAULT_ID_COLUMN_WIDTH,
    defaultColumnWidth: DEFAULT_COLUMN_WIDTH,
    formatCellValue: (v) => v,
    useTailwindTheme: () => themeElement() ?? document.documentElement,
  });

export function CanvasSpreadsheetTableView({
  table,
  rows,
  loading = false,
  stickyHeader = false,
  onCellChange,
  onAddRow,
  onAddColumn,
  onDeleteColumn,
  onEditColumn,
  onEditRow,
  onDeleteRow,
  onEditByCondition,
  onDeleteByCondition,
  onQueryByCondition,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onSave,
  saving = false,
  hasUnsavedChanges = false,
  onImportRows,
  onImportColumns,
}: CanvasSpreadsheetTableViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headerCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CanvasGridRendererInstance | null>(null);
  const rafRef = useRef<number | null>(null);
  const { theme } = useTheme();

  const doRender = useCallback(() => {
    if (!rendererRef.current) return;
    if (stickyHeader) {
      rendererRef.current.render({ skipHeader: true });
      if (headerCanvasRef.current) rendererRef.current.renderHeader(headerCanvasRef.current);
    } else {
      rendererRef.current.render();
    }
  }, [stickyHeader]);

  const createSpreadsheetRenderer = useMemo(
    () => getSpreadsheetRendererConfig(() => containerRef.current),
    []
  );

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
        if (canUndo && onUndo) {
          onUndo();
        }
      }
      // Ctrl+Y 或 Ctrl+Shift+Z 或 Cmd+Shift+Z: 重做
      if (((e.ctrlKey || e.metaKey) && e.key === 'y') || 
          ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        if (canRedo && onRedo) {
          onRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, onUndo, onRedo]);

  // 监听主题变化，重绘 canvas 以应用新的 CSS 变量颜色
  useEffect(() => {
    doRender();
  }, [theme, doRender]);

  // 当 theme 为 system 时，监听系统主题偏好变化
  useEffect(() => {
    if (theme !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => doRender();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme, doRender]);

  // 监听 document 根节点 class 变化（主题实际应用时机），确保 DOM 更新后再重绘
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === "class") {
          doRender();
          break;
        }
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [doRender]);
  
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnKey: string } | null>(null);
  const [cellValue, setCellValue] = useState<string>("");
  const [cellEditorRect, setCellEditorRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({ "__id__": 120 }); // ID列宽度统一存储在 columnWidths 中
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [deleteColumnDialogOpen, setDeleteColumnDialogOpen] = useState(false);
  const [columnToDelete, setColumnToDelete] = useState<{ key: string; label: string } | null>(null);
  const [resizeStartX, setResizeStartX] = useState<number>(0);
  const [resizeStartWidth, setResizeStartWidth] = useState<number>(0);
  const [multiSelectOpen, setMultiSelectOpen] = useState<{ rowId: string; columnKey: string } | null>(null);
  const [popoverWidth, setPopoverWidth] = useState<number>(200);
  const multiSelectTriggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importModeDialogOpen, setImportModeDialogOpen] = useState(false);
  const [columnMappingDialogOpen, setColumnMappingDialogOpen] = useState(false);
  const [columnMismatchDialogOpen, setColumnMismatchDialogOpen] = useState(false);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelData, setExcelData] = useState<any[][]>([]);
  const [columnMappings, setColumnMappings] = useState<Array<{ excelHeader: string; key: string; label: string; type: string; defaultValue: string }>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
  const [hoveredColumnKey, setHoveredColumnKey] = useState<string | null>(null);
  const [conditionMenuOpen, setConditionMenuOpen] = useState(false);
  const [columnMenuOpen, setColumnMenuOpen] = useState<string | null>(null);
  const [rowMenuOpen, setRowMenuOpen] = useState<number | null>(null);
  
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
    logic: FilterLogic;
    groupLogic?: FilterLogic;
    conditions: FilterCondition[];
  }
  
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  
  // 筛选功能
  const checkCondition = useCallback((row: TableRowType, condition: FilterCondition): boolean => {
    const cellValue = String(row.cells[condition.columnKey] || "").toLowerCase();
    const filterValue = condition.value.toLowerCase();
    if (!filterValue.trim()) return true;
    
    switch (condition.operator) {
      case "contains": return cellValue.includes(filterValue);
      case "not_contains": return !cellValue.includes(filterValue);
      case "equals": return cellValue === filterValue;
      case "not_equals": return cellValue !== filterValue;
      case "starts_with": return cellValue.startsWith(filterValue);
      case "ends_with": return cellValue.endsWith(filterValue);
      default: return true;
    }
  }, []);

  const checkGroup = useCallback((row: TableRowType, group: FilterGroup): boolean => {
    if (group.conditions.length === 0) return true;
    const validConditions = group.conditions.filter(c => c.value.trim());
    if (validConditions.length === 0) return true;
    
    if (group.logic === "and") {
      return validConditions.every(condition => checkCondition(row, condition));
    } else {
      return validConditions.some(condition => checkCondition(row, condition));
    }
  }, [checkCondition]);

  const applyFilter = useCallback((row: TableRowType, groups: FilterGroup[]): boolean => {
    if (groups.length === 0) return true;
    let result = checkGroup(row, groups[0]);
    for (let i = 1; i < groups.length; i++) {
      const group = groups[i];
      const groupResult = checkGroup(row, group);
      const groupLogic = group.groupLogic || "and";
      result = groupLogic === "and" ? result && groupResult : result || groupResult;
    }
    return result;
  }, [checkGroup]);

  const filteredRows = useMemo(() => {
    return filterNonDeletedRows(rows).filter((row) =>
      applyFilter(row, filterGroups)
    );
  }, [rows, filterGroups, applyFilter]);

  const gridColumns = useMemo(
    () => (table && columnWidths ? toGridColumns(table, columnWidths) : []),
    [table?.id, table?.columns, columnWidths]
  );
  const gridRows = useMemo(
    () => (table && filteredRows ? toGridRows(filteredRows, table) : []),
    [table?.id, table?.columns, filteredRows]
  );

  // 初始化渲染器（需要 canvas 和 container 都就绪）
  useEffect(() => {
    if (canvasRef.current && containerRef.current && table && filteredRows.length >= 0) {
      try {
        rendererRef.current = createSpreadsheetRenderer(canvasRef.current, containerRef.current);
        rendererRef.current.updateData(gridColumns, gridRows, columnWidths);
        doRender();
      } catch (error) {
        console.error("Canvas 渲染器初始化失败:", error);
      }
    }
  }, [table?.id, table?.columns?.length, filteredRows.length, columnWidths, gridColumns, gridRows, createSpreadsheetRenderer]);

  // 解析 Excel 文件并处理导入流程
  const handleParseExcel = useCallback(
    async (file: File) => {
      try {
        const { headers, data } = await parseExcelFile(file);
        setExcelHeaders(headers);
        setExcelData(data);

        const isNewTable = rows.length === 0 && table.columns.length === 0;

        if (isNewTable) {
          const existingKeys = new Set<string>();
          const mappings = headers.map((header) => {
            const headerStr = String(header).trim();
            const key = generateKeyFromLabel(headerStr, existingKeys);
            existingKeys.add(key);
            return {
              excelHeader: headerStr,
              key,
              label: headerStr,
              type: "text",
              defaultValue: "",
            };
          });
          setColumnMappings(mappings);
          setColumnMappingDialogOpen(true);
          setImportDialogOpen(false);
        } else {
          const excelKeys = headers.map((h) => {
            const headerStr = String(h).trim();
            for (const col of table.columns) {
              const normalizedHeader = normalize(headerStr);
              const normalizedLabel = normalize(col.label);
              const normalizedKey = normalize(col.key);
              if (
                headerStr === col.label ||
                headerStr === col.key ||
                normalizedHeader === normalizedLabel ||
                normalizedHeader === normalizedKey
              ) {
                return col.key;
              }
            }
            return null;
          });

          const allMatched =
            excelKeys.every((key) => key !== null) &&
            excelKeys.length === table.columns.length;

          if (allMatched) {
            setImportModeDialogOpen(true);
            setImportDialogOpen(false);
          } else {
            setColumnMismatchDialogOpen(true);
            setImportDialogOpen(false);
          }
        }
      } catch (err) {
        const msg =
          err instanceof ExcelParseError
            ? err.message
            : err instanceof Error
              ? err.message
              : "解析 Excel 文件失败，请检查文件格式";
        if (msg.includes("xlsx")) {
          setErrorMessage("请先安装 xlsx 库：pnpm add xlsx");
        } else {
          setErrorMessage(msg);
        }
        setErrorDialogOpen(true);
      }
    },
    [table, rows]
  );
  
  // 执行导入
  const executeImport = useCallback((mappings: Array<{ excelHeader: string; key: string; label: string; type: string; defaultValue: string }>, mode: "append" | "replace") => {
    if (!excelData || excelData.length === 0) {
      setErrorMessage("没有找到可导入的数据。请检查Excel文件是否包含数据行。");
      setErrorDialogOpen(true);
      return;
    }
    
    // 创建列映射
    const columnMap: Record<string, string> = {};
    mappings.forEach(m => {
      columnMap[m.excelHeader] = m.key;
    });
    
    // 处理列定义
    let newColumns: Array<{ key: string; label: string; type?: string; defaultValue?: string }> = [];
    if (mode === "replace") {
      // 替换模式：使用导入的所有列替换现有列
      const importedColumns: Array<{ key: string; label: string; type?: string; defaultValue?: string }> = mappings.map(m => ({
        key: m.key,
        label: m.label,
        type: m.type || "text",
        defaultValue: m.defaultValue || ""
      }));
      if (onImportColumns) {
        onImportColumns(importedColumns, "replace");
      }
      // 为了成功消息，记录导入的列
      newColumns = importedColumns;
    } else {
      // 追加模式：只添加新列
      const existingKeys = new Set(table.columns.map(col => col.key));
      mappings.forEach((m: { excelHeader: string; key: string; label: string; type: string; defaultValue: string }) => {
        if (!existingKeys.has(m.key)) {
          newColumns.push({ 
            key: m.key, 
            label: m.label, 
            type: m.type || "text",
            defaultValue: m.defaultValue || ""
          });
        }
      });
      
      if (newColumns.length > 0 && onImportColumns) {
        onImportColumns(newColumns, "append");
      }
    }
    
    // 导入数据行
    const importedRows: TableRowType[] = [];
    const maxRowId = mode === "append" && rows.length > 0
      ? Math.max(...rows.map(r => r.row_id >= 0 ? r.row_id : -1), -1)
      : -1;
    
    excelData.forEach((rowData, index) => {
      if (!rowData || rowData.every(cell => cell === null || cell === undefined || String(cell).trim() === "")) {
        return;
      }
      const cells: Record<string, string> = {};
      
      // 填充映射的列的值（替换模式下，只使用导入的列）
      excelHeaders.forEach((header, headerIndex) => {
        const columnKey = columnMap[header];
        if (columnKey && rowData && rowData[headerIndex] !== undefined && rowData[headerIndex] !== null) {
          cells[columnKey] = String(rowData[headerIndex] || "").trim();
        } else if (columnKey) {
          // 即使值为空，也设置空字符串（确保所有导入的列都有值）
          cells[columnKey] = "";
        }
      });
      
      // 检查是否有数据（替换模式下，即使所有值都是空字符串，也算有数据）
      const hasData = mode === "replace" || Object.keys(cells).length > 0;
      if (hasData) {
        importedRows.push({
          id: `temp-import-${Date.now()}-${index}`,
          table_id: table.id,
          row_id: mode === "append" ? maxRowId + importedRows.length + 1 : importedRows.length,
          cells,
          row_data: undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    });
    
    if (importedRows.length > 0) {
      // 先处理列（如果是替换模式，列已经在上面处理了）
      // 然后处理数据行
      if (onImportRows) {
        onImportRows(importedRows, mode);
      }
      setImportDialogOpen(false);
      setColumnMappingDialogOpen(false);
      setImportModeDialogOpen(false);
      setColumnMismatchDialogOpen(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      const newColumnsInfo = mode === "replace" 
        ? `\n\n已替换为 ${mappings.length} 个列：${mappings.map((m: { excelHeader: string; key: string; label: string }) => m.label).join(", ")}`
        : (newColumns.length > 0 
          ? `\n\n已自动创建 ${newColumns.length} 个新列：${newColumns.map((col: { key: string; label: string; type?: string }) => col.label).join(", ")}`
          : "");
      const modeInfo = mode === "replace" ? "（已替换现有数据和列定义）" : "（已追加到现有数据）";
      setSuccessMessage(`成功导入 ${importedRows.length} 行数据，共 ${excelHeaders.length} 个列。${modeInfo}${newColumnsInfo}`);
      setSuccessDialogOpen(true);
    } else {
      setErrorMessage("没有找到可导入的数据。请检查Excel文件是否包含数据行。");
      setErrorDialogOpen(true);
    }
  }, [excelData, excelHeaders, table, rows, onImportRows, onImportColumns]);
  
  // Excel 导入功能（文件选择后调用）
  const handleFileImport = useCallback(
    async (file: File) => {
      await handleParseExcel(file);
    },
    [handleParseExcel]
  );

  // 更新数据和重绘（渲染器内部从 DOM 读取滚动位置）
  useLayoutEffect(() => {
    if (rendererRef.current && gridColumns.length >= 0 && containerRef.current) {
      rendererRef.current.updateData(gridColumns, gridRows, columnWidths);
      doRender();
    }
  }, [table?.id, table?.columns?.length, filteredRows, scrollX, scrollY, columnWidths, gridColumns, gridRows, doRender]);
  
  // 处理窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      if (rendererRef.current) {
        rendererRef.current.resize();
        doRender();
      }
      
      // 窗口大小变化时，检查滚动位置，避免底部空白
      if (containerRef.current && filteredRows.length >= 0) {
        const viewportHeight = containerRef.current.clientHeight;
        const addRowButtonHeight = CELL_HEIGHT;
        const totalContentHeight = HEADER_HEIGHT + (filteredRows.length * CELL_HEIGHT) + addRowButtonHeight;
        
        if (totalContentHeight <= viewportHeight) {
          if (scrollY !== 0) {
            setScrollY(0);
          }
          if (containerRef.current.scrollTop !== 0) {
            containerRef.current.scrollTop = 0;
          }
        } else {
          const maxScrollY = Math.max(0, totalContentHeight - viewportHeight);
          if (scrollY > maxScrollY) {
            setScrollY(maxScrollY);
            containerRef.current.scrollTop = maxScrollY;
          }
        }
      }
    };
    
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    window.addEventListener("resize", handleResize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRows.length, scrollY, doRender]);
  
  // 处理滚动
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    let newScrollX = target.scrollLeft;
    let newScrollY = target.scrollTop;
    
    // 限制垂直滚动，避免滚动到底部时出现留白
    // 当 endRow 是最后一行时，限制 scrollY 的最大值
    const viewportHeight = target.clientHeight;
    
    if (filteredRows.length > 0) {
      // 计算内容总高度（包括表头、所有行和添加行按钮）
      const addRowButtonHeight = CELL_HEIGHT;
      const totalContentHeight = HEADER_HEIGHT + (filteredRows.length * CELL_HEIGHT) + addRowButtonHeight;
      
      // 计算最大 scrollY，确保滚动到底部时，最后一行（包括添加行按钮）正好在视口底部
      // scrollY + viewportHeight >= totalContentHeight
      // scrollY >= totalContentHeight - viewportHeight
      const maxScrollY = Math.max(0, totalContentHeight - viewportHeight);
      
      // 如果内容高度小于视口高度，强制 scrollY 为 0，避免空白
      if (totalContentHeight <= viewportHeight) {
        newScrollY = 0;
        if (Math.abs(target.scrollTop) > 1) {
          target.scrollTop = 0;
        }
      } else {
        // 如果滚动超过最大值，限制 scrollY，确保底部没有空白
        if (newScrollY > maxScrollY) {
          newScrollY = maxScrollY;
          // 同步更新 DOM 的 scrollTop，防止继续滚动
          if (Math.abs(target.scrollTop - maxScrollY) > 1) {
            target.scrollTop = maxScrollY;
          }
        }
        
        // 确保滚动不会小于0
        if (newScrollY < 0) {
          newScrollY = 0;
          if (Math.abs(target.scrollTop) > 1) {
            target.scrollTop = 0;
          }
        }
      }
    } else {
      // 如果没有数据行，限制 scrollY 不超过表头高度
      const maxScrollY = Math.max(0, HEADER_HEIGHT - viewportHeight);
      if (newScrollY > maxScrollY) {
        newScrollY = maxScrollY;
        if (Math.abs(target.scrollTop - maxScrollY) > 1) {
          target.scrollTop = maxScrollY;
        }
      }
    }
    
    setScrollX(newScrollX);
    setScrollY(newScrollY);
    // 滚动时关闭所有已打开的瓦片（dropdown/popover/sheet）
    setMultiSelectOpen(null);
    setHoveredRowIndex(null);
    setHoveredColumnKey(null);
    setConditionMenuOpen(false);
    setColumnMenuOpen(null);
    setRowMenuOpen(null);
    // RAF 节流：同一帧内多次滚动只触发一次重绘
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      doRender();
    });
  }, [filteredRows.length, doRender]);
  
  // 处理单元格点击
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // 检查是否点击在覆盖层元素上（按钮、下拉菜单等）
    const target = e.target as HTMLElement;
    if (target.closest('[data-overlay]')) {
      return; // 忽略覆盖层上的点击
    }
    
    if (!rendererRef.current || !canvasRef.current || editingCell) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const cell = rendererRef.current.getCellAt(x, y);
    if (cell && cell.colKey) {
      const row = filteredRows[cell.rowIndex];
      if (row) {
        const col = table.columns.find(c => c.key === cell.colKey);
        if (col) {
          setEditingCell({ rowId: row.id, columnKey: cell.colKey });
          setCellValue(row.cells[cell.colKey] || "");
          
          if (col.type === "multi_select") {
            setMultiSelectOpen({ rowId: row.id, columnKey: cell.colKey });
          }
          
          const cellRect = rendererRef.current.getCellRect(cell.rowIndex, cell.colKey);
          if (cellRect) {
            setCellEditorRect(cellRect);
          }
        }
      }
    }
  }, [filteredRows, table.columns, editingCell, scrollX, columnWidths]);
  
  // 处理单元格编辑完成
  const handleCellBlur = useCallback(() => {
    if (editingCell) {
      onCellChange(editingCell.rowId, editingCell.columnKey, cellValue);
      setEditingCell(null);
      setCellEditorRect(null);
      setCellValue("");
    }
  }, [editingCell, cellValue, onCellChange]);
  
  // 列宽调整 - 统一处理 ID 列和其他列
  const handleResizeStart = useCallback((e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnKey);
    setResizeStartX(e.clientX);
    const defaultWidth = columnKey === ID_COLUMN_KEY ? DEFAULT_ID_COLUMN_WIDTH : DEFAULT_COLUMN_WIDTH;
    setResizeStartWidth(columnWidths[columnKey] || defaultWidth);
  }, [columnWidths]);
  
  useEffect(() => {
    if (!resizingColumn) return;
    
    const handleResizeMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX;
      const newWidth = Math.max(50, resizeStartWidth + diff);
      
      // 统一处理 ID 列和其他列
      setColumnWidths(prev => ({
        ...prev,
        [resizingColumn]: newWidth,
      }));
    };

    const handleResizeEnd = () => {
      setResizingColumn(null);
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth]);
  
  // 计算总宽度和高度
  const totalWidth = useMemo(() => {
    if (!table || !table.columns) return columnWidths[ID_COLUMN_KEY] || DEFAULT_ID_COLUMN_WIDTH;
    const idWidth = columnWidths[ID_COLUMN_KEY] || DEFAULT_ID_COLUMN_WIDTH;
    return idWidth + table.columns.reduce((sum, col) => {
      return sum + (columnWidths[col.key] || DEFAULT_COLUMN_WIDTH);
    }, 0);
  }, [table?.columns, columnWidths]);
  
  // 计算实际内容高度
  const actualContentHeight = useMemo(() => {
    const contentHeight = HEADER_HEIGHT + (filteredRows.length * CELL_HEIGHT);
    const addRowButtonHeight = CELL_HEIGHT;
    return contentHeight + addRowButtonHeight;
  }, [filteredRows.length]);

  // 视口高度（用于：内容短时让添加行按钮位于视口底部）
  const [viewportHeight, setViewportHeight] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 滚动内容高度：至少等于视口高度，确保内容短时添加行按钮可位于视口底部
  const totalHeight = Math.max(actualContentHeight, viewportHeight || actualContentHeight);

  // 添加行按钮的 top：内容短时置于视口底部，否则置于最后一行下方
  const addRowButtonTop =
    viewportHeight > 0 && actualContentHeight < viewportHeight
      ? viewportHeight - CELL_HEIGHT
      : HEADER_HEIGHT + filteredRows.length * CELL_HEIGHT;
  
  // 格式化显示值（用于编辑器的显示）
  const formatDisplayValue = useCallback((value: string, col: typeof table.columns[0]) => {
    if (!value) return "";
    
    const columnType = col.type || "text";
    
    switch (columnType) {
      case "date":
        return value;
      case "multi_select":
        // 按逗号或空格分割，去重后显示，避免 "注册 注册" 等重复值
        return [...new Set(value.split(/[,\s]+/).map(v => v.trim()).filter(v => v))].join(", ");
      default:
        return value;
    }
  }, []);
  
  // 渲染单元格编辑器
  const renderCellEditor = useCallback((col: typeof table.columns[0]) => {
    const columnType = col.type || "text";
    
    switch (columnType) {
      case "number":
        return (
          <Input
            type="number"
            value={cellValue}
            onChange={(e) => setCellValue(e.target.value)}
            onBlur={handleCellBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCellBlur();
              } else if (e.key === "Escape") {
                setEditingCell(null);
                setCellEditorRect(null);
                setCellValue("");
              }
            }}
            className="h-full w-full border-0 focus-visible:ring-0 p-2"
            autoFocus
          />
        );
      
      case "date":
        return (
          <div className="h-full w-full p-1">
            <DatePicker
              value={cellValue}
              onChange={(value) => {
                setCellValue(value || "");
                handleCellBlur();
              }}
              format={col.options?.format || "YYYY/MM/DD"}
              className="h-full"
            />
          </div>
        );
      
      case "single_select":
        const singleOptions = col.options?.options || [];
        return (
          <Select
            value={cellValue}
            onValueChange={(value) => {
              setCellValue(value);
              handleCellBlur();
            }}
          >
            <SelectTrigger className="h-full w-full border-0 rounded-none">
              <SelectValue placeholder="请选择" />
            </SelectTrigger>
            <SelectContent>
              {singleOptions.map((option: string) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      
      case "multi_select":
        const multiOptions = col.options?.options || [];
        const selectedValues = cellValue ? [...new Set(cellValue.split(/[,\s]+/).map(v => v.trim()).filter(v => v))] : [];
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
        
        const multiSelectContent = (
              <div className="max-h-60 overflow-y-auto custom-scrollbar">
                {filteredOptions.map((option: string) => (
                  <div
                    key={option}
                    className={cn(
                      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pr-8 pl-8 text-sm outline-none hover:bg-accent"
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
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <span className="flex-1">{option}</span>
                  </div>
                ))}
              </div>
        );

        return (
          <ResponsivePopover
            open={isMultiSelectOpen}
            onOpenChange={(open) => {
              if (open) {
                setMultiSelectOpen({ rowId: editingCell!.rowId, columnKey: editingCell!.columnKey });
                setTimeout(() => {
                  if (multiSelectTriggerRef.current) {
                    const width = multiSelectTriggerRef.current.offsetWidth;
                    setPopoverWidth(width);
                  }
                }, 0);
              } else {
                setMultiSelectOpen(null);
                if (editingCell) {
                  const normalized = [...new Set(cellValue.split(/[,\s]+/).map(v => v.trim()).filter(v => v))].join(",");
                  onCellChange(editingCell.rowId, editingCell.columnKey, normalized);
                }
              }
            }}
            trigger={
              <button
                ref={multiSelectTriggerRef}
                type="button"
                onClick={() => {
                  if (multiSelectTriggerRef.current) {
                    const width = multiSelectTriggerRef.current.offsetWidth;
                    setPopoverWidth(width);
                  }
                }}
                className={cn(
                  "h-full w-full flex items-center justify-between gap-2 rounded-none border-0 bg-transparent px-3 py-2 text-sm",
                  selectedValues.length === 0 && "text-muted-foreground"
                )}
              >
                <span className="truncate flex-1 text-left">{displayText}</span>
                <ChevronDownIcon className="h-4 w-4 opacity-50 shrink-0" />
              </button>
            }
            title="多选"
            content={multiSelectContent}
            align="start"
            contentClassName="p-1"
            contentStyle={{ width: `${popoverWidth}px`, minWidth: `${popoverWidth}px` }}
          />
        );
      
      default: // text
        return (
          <Textarea
            value={cellValue}
            onChange={(e) => setCellValue(e.target.value)}
            onBlur={handleCellBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                e.preventDefault();
                handleCellBlur();
              } else if (e.key === "Escape") {
                setEditingCell(null);
                setCellEditorRect(null);
                setCellValue("");
              }
            }}
            className="w-full border-0 focus-visible:ring-0 resize-none p-2"
            rows={3}
            autoFocus
          />
        );
    }
  }, [cellValue, handleCellBlur, table.columns, multiSelectOpen, editingCell, onCellChange]);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full min-h-0 min-w-0">
      {/* 工具栏 - 响应式：小屏换行、图标+文字 */}
      <div className="flex flex-wrap items-center gap-2 p-2 sm:p-3 border-b bg-muted/50 shrink-0">
        <Button size="sm" variant="outline" onClick={onAddRow} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">添加记录</span>
        </Button>
        {(onEditByCondition || onDeleteByCondition || onQueryByCondition) && (
          <ResponsiveMenu
            open={conditionMenuOpen}
            onOpenChange={setConditionMenuOpen}
            trigger={
              <Button size="sm" variant="outline" className="gap-1 shrink-0">
                <span className="hidden sm:inline">按条件操作</span>
                <ChevronDownIcon className="h-4 w-4 shrink-0" />
              </Button>
            }
            title="按条件操作"
            align="start"
            items={[
              ...(onQueryByCondition ? [{ icon: <Search className="h-4 w-4" />, label: "按条件查找", onClick: onQueryByCondition }] : []),
              ...(onEditByCondition ? [{ icon: <Pencil className="h-4 w-4" />, label: "按条件编辑", onClick: onEditByCondition }] : []),
              ...(onDeleteByCondition ? [{ icon: <Trash2 className="h-4 w-4" />, label: "按条件删除", onClick: onDeleteByCondition, variant: "destructive" as const }] : []),
            ]}
          />
        )}
        {onUndo && (
          <Button
            size="sm"
            variant="outline"
            onClick={onUndo}
            disabled={!canUndo}
            title="撤销 (Ctrl+Z)"
            className="shrink-0"
          >
            <Undo2 className="h-4 w-4" />
            <span className="hidden sm:inline">撤销</span>
          </Button>
        )}
        {onRedo && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRedo}
            disabled={!canRedo}
            title="重做 (Ctrl+Y)"
            className="shrink-0"
          >
            <Redo2 className="h-4 w-4" />
            <span className="hidden sm:inline">重做</span>
          </Button>
        )}
        {/* 保存按钮 - 一直存在 */}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <Button
            size="sm"
            variant={filterGroups.length > 0 ? "default" : "outline"}
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className="gap-1.5 shrink-0"
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">筛选</span>
            {filterGroups.length > 0 && (
              <span className="bg-primary-foreground text-primary px-1.5 py-0.5 rounded text-xs">
                {filterGroups.reduce((sum, g) => sum + g.conditions.length, 0)}
              </span>
            )}
          </Button>
          {onImportRows && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
              className="shrink-0"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">导入 Excel</span>
            </Button>
          )}
          {onSave && (
            <Button
              size="sm"
              onClick={onSave}
              disabled={saving || !hasUnsavedChanges}
              className="gap-1.5 shrink-0"
            >
              <Save className="h-4 w-4" />
              <span className="hidden sm:inline">{saving ? "保存中..." : "保存"}</span>
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
                            onValueChange={(value: FilterLogic) => {
                              setFilterGroups(groups =>
                                groups.map(g =>
                                  g.id === group.id ? { ...g, groupLogic: value } : g
                                )
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
                          setFilterGroups(groups =>
                            groups.map(g =>
                              g.id === group.id ? { ...g, logic: value } : g
                            )
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
                      onClick={() => {
                        setFilterGroups(groups => groups.filter(g => g.id !== group.id));
                      }}
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
                            setFilterGroups(groups =>
                              groups.map(g =>
                                g.id === group.id
                                  ? {
                                      ...g,
                                      conditions: g.conditions.map(c =>
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
                            {table.columns.map((col) => (
                              <SelectItem key={col.key} value={col.key}>
                                {col.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={condition.operator}
                          onValueChange={(value: FilterOperator) => {
                            setFilterGroups(groups =>
                              groups.map(g =>
                                g.id === group.id
                                  ? {
                                      ...g,
                                      conditions: g.conditions.map(c =>
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
                            setFilterGroups(groups =>
                              groups.map(g =>
                                g.id === group.id
                                  ? {
                                      ...g,
                                      conditions: g.conditions.map(c =>
                                        c.id === condition.id ? { ...c, value: e.target.value } : c
                                      ),
                                    }
                                  : g
                              )
                            );
                          }}
                          placeholder="输入值"
                          className="flex-1 h-8"
                        />
                        {group.conditions.length > 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setFilterGroups(groups =>
                                groups.map(g =>
                                  g.id === group.id
                                    ? {
                                        ...g,
                                        conditions: g.conditions.filter(c => c.id !== condition.id),
                                      }
                                    : g
                                )
                              );
                            }}
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
                      onClick={() => {
                        setFilterGroups(groups =>
                          groups.map(g =>
                            g.id === group.id
                              ? {
                                  ...g,
                                  conditions: [
                                    ...g.conditions,
                                    {
                                      id: `condition-${Date.now()}`,
                                      columnKey: table.columns[0]?.key || "",
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
                      <Plus className="h-3 w-3" />
                      添加条件
                    </Button>
                  </div>
                </div>
              ))
            )}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                setFilterGroups([...filterGroups, {
                  id: `group-${Date.now()}`,
                  logic: "and",
                  groupLogic: filterGroups.length > 0 ? "and" : undefined,
                  conditions: [{
                    id: `condition-${Date.now()}`,
                    columnKey: table.columns[0]?.key || "",
                    operator: "contains",
                    value: "",
                  }],
                }]);
              }}>
                <Plus className="h-4 w-4" />
                添加筛选组
              </Button>
              {filterGroups.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setFilterGroups([])}>
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
      
      {/* Canvas 表格容器 - min-w-0 使 flex 子项可收缩，overflow-auto 支持横向+纵向滚动 */}
      <div
        ref={containerRef}
        className="flex-1 min-w-0 overflow-auto relative min-h-0 custom-scrollbar"
        onScroll={handleScroll}
      >
        {/* 滚动占位 - stickyHeader 时表头用 position:sticky 吸顶，由浏览器原生处理避免抖动 */}
        <div
          style={{
            width: totalWidth,
            height: totalHeight,
            minWidth: totalWidth,
            minHeight: totalHeight,
            position: stickyHeader ? "relative" : undefined,
            zIndex: stickyHeader ? 5 : undefined,
          }}
          aria-hidden
        >
          {stickyHeader && (
            <div
              className="sticky top-0 left-0"
              style={{
                width: totalWidth,
                height: HEADER_HEIGHT,
                zIndex: 10,
              }}
            >
              <canvas
                ref={headerCanvasRef}
                className="pointer-events-none"
                style={{
                  width: `${totalWidth}px`,
                  height: `${HEADER_HEIGHT}px`,
                }}
                width={totalWidth * (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1)}
                height={HEADER_HEIGHT * (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1)}
                aria-hidden
              />
            </div>
          )}
        </div>
        
        {/* Canvas - stickyHeader 时仅绘制 body，表头用定位层；否则整体绘制 */}
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0"
          style={{ 
            width: "100%", 
            height: "100%", 
            pointerEvents: "auto",
            transform: `translate3d(${scrollX}px, ${scrollY}px, 0)`,
          }}
          onClick={handleCanvasClick}
            onMouseMove={(e) => {
              if (!rendererRef.current || !canvasRef.current) return;
              // 检查是否在覆盖层元素上（按钮、下拉菜单等）
              const target = e.target as HTMLElement;
              if (target.closest('[data-overlay]')) {
                return; // 忽略覆盖层上的鼠标移动
              }
              
              const rect = canvasRef.current.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              
              // 检查是否在表头区域
              if (y < HEADER_HEIGHT) {
                setHoveredRowIndex(null);
                // 查找悬停的列
                const adjustedX = x + scrollX;
                const idWidth = columnWidths[ID_COLUMN_KEY] || DEFAULT_ID_COLUMN_WIDTH;
                if (adjustedX > idWidth) {
                  let colX = idWidth;
                  for (const col of table.columns) {
                    const width = columnWidths[col.key] || DEFAULT_COLUMN_WIDTH;
                    if (adjustedX >= colX && adjustedX < colX + width) {
                      setHoveredColumnKey(col.key);
                      break;
                    }
                    colX += width;
                  }
                } else {
                  setHoveredColumnKey(null);
                }
              } else {
                setHoveredColumnKey(null);
                const cell = rendererRef.current.getCellAt(x, y);
                if (cell) {
                  setHoveredRowIndex(cell.rowIndex);
                } else {
                  setHoveredRowIndex(null);
                }
              }
            }}
            onMouseLeave={(e) => {
              // 检查是否移动到覆盖层元素上
              const target = e.relatedTarget as HTMLElement;
              if (target && target.closest('[data-overlay]')) {
                return; // 移动到覆盖层上时不清除 hover 状态
              }
              setHoveredRowIndex(null);
              setHoveredColumnKey(null);
            }}
          />
          
          {/* 覆盖层 - stickyHeader 时仅横向偏移（表头用 position:sticky），否则跟随滚动 */}
          <div 
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              transform: stickyHeader
                ? `translate3d(${scrollX}px, 0, 0)`
                : `translate3d(${scrollX}px, ${scrollY}px, 0)`,
            }}
          >
          {/* ID列宽调整手柄 */}
          {(() => {
            const idColX = Math.max(0, -scrollX);
            const idWidth = columnWidths[ID_COLUMN_KEY] || DEFAULT_ID_COLUMN_WIDTH;
            if (idColX + idWidth > 0 && idColX < (containerRef.current?.clientWidth || 0)) {
              return (
                <div
                  key="id-column-resize"
                  className="absolute top-0 cursor-col-resize hover:bg-primary/50 transition-colors z-30 pointer-events-auto"
                  style={{
                    left: `${idColX + idWidth - 1}px`,
                    width: "2px",
                    height: `${HEADER_HEIGHT}px`,
                  }}
                  onMouseDown={(e) => handleResizeStart(e, ID_COLUMN_KEY)}
                />
              );
            }
            return null;
          })()}
          
          {/* 表头操作菜单和列宽调整手柄 */}
          {table.columns.map((col, idx) => {
            const idWidth = columnWidths[ID_COLUMN_KEY] || DEFAULT_ID_COLUMN_WIDTH;
            const colX = idWidth + table.columns.slice(0, idx).reduce((sum, c) => 
              sum + (columnWidths[c.key] || DEFAULT_COLUMN_WIDTH), 0
            ) - scrollX;
            const width = columnWidths[col.key] || DEFAULT_COLUMN_WIDTH;
            
            if (colX + width > 0 && colX < (containerRef.current?.clientWidth || 0)) {
              return (
                <div key={`header-${col.key}`}>
                  {/* 列操作菜单按钮 */}
                  {hoveredColumnKey === col.key && (
                    <div
                      data-overlay
                      className="absolute top-0 z-40 pointer-events-auto"
                      style={{
                        left: `${colX + width - 30}px`,
                        top: "5px",
                      }}
                      onMouseEnter={(e) => {
                        e.stopPropagation();
                        // 保持 hover 状态
                      }}
                      onMouseLeave={(e) => {
                        e.stopPropagation();
                        // 不立即清除，让 Canvas 的 onMouseLeave 处理
                      }}
                      onMouseMove={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <ResponsiveMenu
                        open={columnMenuOpen === col.key}
                        onOpenChange={(open) => setColumnMenuOpen(open ? col.key : null)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-muted shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        }
                        title={`列: ${col.label}`}
                        align="end"
                        stopPropagation
                        items={[
                          { icon: <Pencil className="h-4 w-4" />, label: "编辑", onClick: () => onEditColumn(col.key) },
                          { icon: <Trash2 className="h-4 w-4" />, label: "删除", onClick: () => { setColumnToDelete({ key: col.key, label: col.label }); setDeleteColumnDialogOpen(true); }, variant: "destructive" },
                        ]}
                      />
                    </div>
                  )}
                  {/* 列宽调整手柄 */}
                  <div
                    className="absolute top-0 cursor-col-resize hover:bg-primary/50 transition-colors z-30 pointer-events-auto"
                    style={{
                      left: `${colX + width - 1}px`,
                      width: "2px",
                      height: `${HEADER_HEIGHT}px`,
                    }}
                    onMouseDown={(e) => handleResizeStart(e, col.key)}
                  />
                </div>
              );
            }
            return null;
          })}
          
          {/* 添加列按钮 - 在最后一列后面 */}
          {onAddColumn && (() => {
            // 计算最后一列的右边界位置
            const idWidth = columnWidths[ID_COLUMN_KEY] || DEFAULT_ID_COLUMN_WIDTH;
            let lastColX = idWidth - scrollX;
            table.columns.forEach(col => {
              lastColX += (columnWidths[col.key] || DEFAULT_COLUMN_WIDTH);
            });
            
            // 按钮始终显示在最后一列后面（即使不可见也显示，方便添加列）
            return (
              <div
                key="add-column-button"
                className="absolute top-0 z-30 bg-muted border-0 pointer-events-auto"
                style={{
                  left: `${Math.max(0, lastColX)}px`,
                  top: "0px",
                  width: "48px",
                  height: `${HEADER_HEIGHT}px`,
                  padding: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 border-0"
                  onClick={onAddColumn}
                  title="添加列"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            );
          })()}
          
          {/* 添加行按钮 - 在表格底部 */}
          <div
            className="absolute z-30 bg-muted/30 border border-border pointer-events-auto"
            style={{
              left: `${-scrollX}px`,
              top: `${HEADER_HEIGHT + (filteredRows.length * CELL_HEIGHT) - scrollY}px`,
              width: `${totalWidth}px`,
              height: `${CELL_HEIGHT}px`,
              padding: "8px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Button
              variant="ghost"
              onClick={onAddRow}
              className="w-full text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              添加行
            </Button>
          </div>
          
          {/* 单元格编辑覆盖层 */}
          {editingCell && cellEditorRect && (
            <div
              className="absolute border-2 border-primary bg-background z-50 shadow-lg pointer-events-auto"
              style={{
                left: `${Math.max(0, cellEditorRect.x)}px`,
                top: `${Math.max(HEADER_HEIGHT, cellEditorRect.y)}px`,
                width: `${cellEditorRect.width}px`,
                minHeight: `${cellEditorRect.height}px`,
              }}
            >
              {(() => {
                const col = table.columns.find(c => c.key === editingCell.columnKey);
                return col ? renderCellEditor(col) : null;
              })()}
            </div>
          )}
          
          {/* 操作列：编辑/删除通过下拉切换 */}
          {(onEditRow || onDeleteRow) && hoveredRowIndex !== null && hoveredRowIndex >= 0 && hoveredRowIndex < filteredRows.length && (
            <div
              data-overlay
              className="absolute z-40 transition-opacity pointer-events-auto"
              style={{
                left: `${totalWidth - scrollX}px`,
                top: `${HEADER_HEIGHT + (hoveredRowIndex * CELL_HEIGHT) - scrollY + CELL_HEIGHT / 2}px`,
                transform: "translate(-100%, -50%)",
              }}
              onMouseEnter={(e) => {
                e.stopPropagation();
              }}
              onMouseLeave={(e) => {
                e.stopPropagation();
              }}
              onMouseMove={(e) => {
                e.stopPropagation();
              }}
            >
              <ResponsiveMenu
                open={rowMenuOpen === hoveredRowIndex}
                onOpenChange={(open) => setRowMenuOpen(open ? hoveredRowIndex : null)}
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-muted bg-background/90 shadow-sm"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    title="操作"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                }
                title="行操作"
                align="end"
                stopPropagation
                items={[
                  ...(onEditRow ? [{ icon: <Pencil className="h-4 w-4" />, label: "编辑", onClick: () => { const row = filteredRows[hoveredRowIndex]; if (row && onEditRow) onEditRow(row); } }] : []),
                  ...(onDeleteRow ? [{ icon: <Trash2 className="h-4 w-4" />, label: "删除", onClick: () => { const row = filteredRows[hoveredRowIndex]; if (row && onDeleteRow) onDeleteRow(row); }, variant: "destructive" as const }] : []),
                ]}
              />
            </div>
          )}
          </div>
      </div>

      {/* 删除列确认对话框 */}
      <Dialog open={deleteColumnDialogOpen} onOpenChange={setDeleteColumnDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg mx-auto">
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
        <>
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85dvh] sm:max-h-[90vh] mx-auto">
              <DialogHeader>
                <DialogTitle>导入 Excel 文件</DialogTitle>
                <DialogDescription>
                  <div className="space-y-3 mt-2">
                    <div>
                      <p className="font-medium mb-1">导入规则：</p>
                      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                        <li>第一行将作为列标题</li>
                        <li>支持的格式：.xlsx, .xls</li>
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

          {/* 列映射对话框（新表格导入时定义列的 key，或列不一致时重新定义） */}
          <Dialog open={columnMappingDialogOpen} onOpenChange={setColumnMappingDialogOpen}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[85dvh] sm:max-h-[80vh] flex flex-col overflow-hidden p-0 gap-0 mx-auto">
              <DialogHeader className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 pr-12 border-b">
                <DialogTitle>定义列信息</DialogTitle>
                <DialogDescription>
                  {importMode === "replace" 
                    ? "请为 Excel 中的每一列定义列 Key、数据类型和默认值。导入将替换所有现有数据，此操作不可恢复。"
                    : "请为 Excel 中的每一列定义列 Key、数据类型和默认值。列 Key 将用于数据存储，建议使用英文和下划线。"}
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 custom-scrollbar">
                <div className="space-y-4">
                <div className="space-y-2">
                  {columnMappings.map((mapping, index) => (
                    <div key={index} className="p-3 border rounded-lg space-y-3">
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            Excel 列名
                          </Label>
                          <div className="text-sm font-medium">{mapping.excelHeader}</div>
                        </div>
                        <div className="flex-1">
                          <Label htmlFor={`key-${index}`} className="text-xs text-muted-foreground mb-1 block">
                            列 Key *
                          </Label>
                          <Input
                            id={`key-${index}`}
                            value={mapping.key}
                            onChange={(e) => {
                              const newMappings = [...columnMappings];
                              newMappings[index].key = e.target.value.trim();
                              setColumnMappings(newMappings);
                            }}
                            placeholder="例如: user_name"
                            className="text-sm"
                          />
                        </div>
                        <div className="flex-1">
                          <Label htmlFor={`type-${index}`} className="text-xs text-muted-foreground mb-1 block">
                            数据类型 *
                          </Label>
                          <Select
                            value={mapping.type}
                            onValueChange={(value) => {
                              const newMappings = [...columnMappings];
                              newMappings[index].type = value;
                              setColumnMappings(newMappings);
                            }}
                          >
                            <SelectTrigger id={`type-${index}`} className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">文本</SelectItem>
                              <SelectItem value="number">数字</SelectItem>
                              <SelectItem value="date">日期</SelectItem>
                              <SelectItem value="single_select">单选</SelectItem>
                              <SelectItem value="multi_select">多选</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1">
                          <Label htmlFor={`defaultValue-${index}`} className="text-xs text-muted-foreground mb-1 block">
                            默认值
                          </Label>
                          <Input
                            id={`defaultValue-${index}`}
                            type={mapping.type === "number" ? "number" : "text"}
                            value={mapping.defaultValue}
                            onChange={(e) => {
                              const newMappings = [...columnMappings];
                              newMappings[index].defaultValue = e.target.value;
                              setColumnMappings(newMappings);
                            }}
                            placeholder="可选，新建行时自动填充此值"
                            className="text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              </div>
              <DialogFooter className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setColumnMappingDialogOpen(false);
                    setColumnMappings([]);
                    setExcelHeaders([]);
                    setExcelData([]);
                  }}
                >
                  取消
                </Button>
                <Button 
                  onClick={() => {
                    // 验证所有列都有 key 和 type
                    const isValid = columnMappings.every(m => m.key.trim() && m.type);
                    if (!isValid) {
                      setErrorMessage("请填写所有列的 Key 和数据类型");
                      setErrorDialogOpen(true);
                      return;
                    }
                    // 检查 key 是否重复
                    const keys = columnMappings.map(m => m.key.trim());
                    const uniqueKeys = new Set(keys);
                    if (keys.length !== uniqueKeys.size) {
                      setErrorMessage("列 Key 不能重复");
                      setErrorDialogOpen(true);
                      return;
                    }
                    // 执行导入（使用当前设置的 importMode）
                    executeImport(columnMappings, importMode);
                  }}
                >
                  确认导入
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 导入模式选择对话框（已有表格且列一致时） */}
          <Dialog open={importModeDialogOpen} onOpenChange={setImportModeDialogOpen}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-lg mx-auto">
              <DialogHeader>
                <DialogTitle>选择导入模式</DialogTitle>
                <DialogDescription>
                  Excel 文件的列与当前表格的列一致，请选择导入方式：
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="append"
                      name="importMode"
                      value="append"
                      checked={importMode === "append"}
                      onChange={(e) => setImportMode(e.target.value as "append" | "replace")}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="append" className="cursor-pointer">
                      <div className="font-medium">追加数据</div>
                      <div className="text-sm text-muted-foreground">
                        将 Excel 数据追加到现有数据之后
                      </div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="replace"
                      name="importMode"
                      value="replace"
                      checked={importMode === "replace"}
                      onChange={(e) => setImportMode(e.target.value as "append" | "replace")}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="replace" className="cursor-pointer">
                      <div className="font-medium">替换数据</div>
                      <div className="text-sm text-muted-foreground">
                        用 Excel 数据替换所有现有数据（此操作不可恢复）
                      </div>
                    </Label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setImportModeDialogOpen(false);
                    setExcelHeaders([]);
                    setExcelData([]);
                  }}
                >
                  取消
                </Button>
                <Button 
                  onClick={() => {
                    // 创建列映射（列一致时，直接使用现有列）
                    const mappings = excelHeaders.map(header => {
                      const headerStr = String(header).trim();
                      const col = table.columns.find((c) =>
                      headerStr === c.label ||
                      headerStr === c.key ||
                      normalize(headerStr) === normalize(c.label) ||
                      normalize(headerStr) === normalize(c.key)
                    );
                      return {
                        excelHeader: headerStr,
                        key: col?.key || headerStr,
                        label: col?.label || headerStr,
                        type: col?.type || "text",
                        defaultValue: col?.options?.defaultValue || "",
                      };
                    });
                    executeImport(mappings, importMode);
                  }}
                >
                  确认导入
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 列不一致确认对话框 */}
          <Dialog open={columnMismatchDialogOpen} onOpenChange={setColumnMismatchDialogOpen}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85dvh] sm:max-h-[90vh] mx-auto overflow-y-auto">
              <DialogHeader>
                <DialogTitle>列不一致</DialogTitle>
                <DialogDescription>
                  <div className="space-y-2 mt-2">
                    <p>Excel 文件的列与当前表格的列不一致。</p>
                    <div className="text-sm">
                      <p className="font-medium mb-1">Excel 列：</p>
                      <p className="text-muted-foreground">{excelHeaders.join(", ")}</p>
                    </div>
                    <div className="text-sm">
                      <p className="font-medium mb-1">表格列：</p>
                      <p className="text-muted-foreground">{table.columns.map(c => c.label).join(", ")}</p>
                    </div>
                    <p className="text-destructive font-medium mt-2">
                      导入将替换所有现有数据，此操作不可恢复。
                    </p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setColumnMismatchDialogOpen(false);
                    setExcelHeaders([]);
                    setExcelData([]);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  取消
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => {
                    const existingKeys = new Set(table.columns.map((col) => col.key));
                    const mappings = excelHeaders.map(header => {
                      const headerStr = String(header).trim();
                      const key = generateKeyFromLabel(headerStr, existingKeys);
                      existingKeys.add(key);
                      return {
                        excelHeader: headerStr,
                        key: key,
                        label: headerStr,
                        type: "text",
                        defaultValue: "",
                      };
                    });
                    setColumnMappings(mappings);
                    setImportMode("replace");
                    setColumnMismatchDialogOpen(false);
                    // 显示列映射对话框，让用户确认/修改列的 key
                    setColumnMappingDialogOpen(true);
                  }}
                >
                  确认替换
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 错误提示对话框 */}
          <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-lg mx-auto">
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
            <DialogContent className="w-[calc(100vw-2rem)] max-w-lg mx-auto">
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
        </>
      )}
    </div>
  );
}
