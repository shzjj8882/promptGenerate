"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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

interface CanvasSpreadsheetTableViewProps {
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
  onImportColumns?: (columns: Array<{ key: string; label: string; type?: string; defaultValue?: string }>, mode?: "append" | "replace") => void;
}

// 渲染配置常量
const CELL_HEIGHT = 40; // 每行高度
const HEADER_HEIGHT = 40; // 表头高度
const ID_COLUMN_KEY = "__id__"; // ID列的 key
const DEFAULT_COLUMN_WIDTH = 150; // 默认列宽
const DEFAULT_ID_COLUMN_WIDTH = 120; // ID列默认宽度
const TILE_SIZE = 512; // 瓦片大小（像素）

// 瓦片缓存接口
interface Tile {
  canvas: HTMLCanvasElement;
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  lastUsed: number;
}

// Canvas 渲染引擎类
class CanvasTableRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private devicePixelRatio: number;
  
  // 表格配置
  private table: MultiDimensionTable;
  private rows: TableRowType[];
  private columnWidths: Record<string, number>;
  
  // 渲染状态
  private scrollX: number = 0;
  private scrollY: number = 0;
  private viewportWidth: number = 0;
  private viewportHeight: number = 0;
  
  // 瓦片缓存
  private tileCache: Map<string, Tile> = new Map();
  private maxCacheSize: number = 50; // 最大缓存瓦片数
  
  // 样式配置
  private styles = {
    headerBg: "#f5f5f5",
    cellBg: "#ffffff",
    selectedBg: "#e3f2fd",
    borderColor: "#e0e0e0",
    headerText: "#333333",
    cellText: "#000000",
    headerFont: "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    cellFont: "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };
  
  constructor(canvas: HTMLCanvasElement, table: MultiDimensionTable, rows: TableRowType[], columnWidths: Record<string, number>) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("无法获取 Canvas 渲染上下文");
    }
    this.ctx = ctx;
    this.table = table;
    this.rows = rows;
    this.columnWidths = columnWidths;
    
    // 处理高DPI屏幕
    this.devicePixelRatio = window.devicePixelRatio || 1;
    this.resizeCanvas();
  }
  
  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.viewportWidth = rect.width;
    this.viewportHeight = rect.height;
    
    // 设置实际画布大小（考虑设备像素比）
    this.canvas.width = this.viewportWidth * this.devicePixelRatio;
    this.canvas.height = this.viewportHeight * this.devicePixelRatio;
    
    // 重置变换矩阵，然后缩放上下文以匹配设备像素比
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.devicePixelRatio, this.devicePixelRatio);
    
    // 设置文字渲染质量
    this.ctx.textBaseline = "middle";
    this.ctx.textAlign = "left";
    
    // 清除缓存，因为画布大小改变了
    this.tileCache.clear();
  }
  
  setScroll(x: number, y: number) {
    this.scrollX = x;
    this.scrollY = y;
  }
  
  setColumnWidths(widths: Record<string, number>) {
    this.columnWidths = widths;
    this.tileCache.clear(); // 清除缓存
  }
  
  // 获取 ID 列宽度
  private getIdColumnWidth(): number {
    return this.columnWidths[ID_COLUMN_KEY] || DEFAULT_ID_COLUMN_WIDTH;
  }
  
  updateData(table: MultiDimensionTable, rows: TableRowType[]) {
    this.table = table;
    this.rows = rows;
    this.tileCache.clear(); // 清除缓存
  }
  
  // 获取可见区域的行和列范围
  // 绘制单个单元格
  private drawCell(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    value: string,
    isHeader: boolean = false,
    isSelected: boolean = false
  ) {
    // 背景色
    if (isHeader) {
      ctx.fillStyle = this.styles.headerBg;
    } else if (isSelected) {
      ctx.fillStyle = this.styles.selectedBg;
    } else {
      ctx.fillStyle = this.styles.cellBg;
    }
    ctx.fillRect(x, y, width, height);
    
    // 边框
    ctx.strokeStyle = this.styles.borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
    
    // 文字
    if (value && width > 0) {
      // 确保字体设置正确（每次绘制前重新设置，避免状态污染）
      ctx.fillStyle = isHeader ? this.styles.headerText : this.styles.cellText;
      ctx.font = isHeader ? this.styles.headerFont : this.styles.cellFont;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      
      // 文本裁剪 - 确保使用当前列宽
      const padding = 8;
      const textX = x + padding;
      const textY = y + height / 2;
      const maxWidth = Math.max(0, width - padding * 2); // 确保不为负
      
      if (maxWidth > 0) {
        // 先测量完整文本
        const metrics = ctx.measureText(value);
        
        if (metrics.width > maxWidth) {
          // 文本过长，需要截断
          let truncated = value;
          const ellipsis = "...";
          const ellipsisWidth = ctx.measureText(ellipsis).width;
          const maxTextWidth = maxWidth - ellipsisWidth;
          
          // 二分查找最优截断点
          if (maxTextWidth > 0) {
            let low = 0;
            let high = truncated.length;
            let bestFit = 0;
            
            while (low <= high) {
              const mid = Math.floor((low + high) / 2);
              const testText = truncated.substring(0, mid);
              const testWidth = ctx.measureText(testText).width;
              
              if (testWidth <= maxTextWidth) {
                bestFit = mid;
                low = mid + 1;
              } else {
                high = mid - 1;
              }
            }
            
            truncated = truncated.substring(0, bestFit);
          } else {
            truncated = "";
          }
          
          ctx.fillText(truncated + ellipsis, textX, textY);
        } else {
          // 文本可以完整显示
          ctx.fillText(value, textX, textY);
        }
      }
    }
  }
  
  // 清理旧的缓存瓦片
  private cleanupTileCache() {
    if (this.tileCache.size <= this.maxCacheSize) return;
    
    // 按最后使用时间排序，删除最旧的
    const tiles = Array.from(this.tileCache.entries())
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    
    const toRemove = tiles.slice(0, tiles.length - this.maxCacheSize);
    toRemove.forEach(([key]) => this.tileCache.delete(key));
  }
  
  // 渲染可见区域（直接渲染，不使用瓦片缓存）
  render() {
    const ctx = this.ctx;
    
    // 重置变换矩阵，确保缩放正确
    // 先重置为单位矩阵，再应用设备像素比缩放
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(this.devicePixelRatio, this.devicePixelRatio);
    
    // 清除画布（使用逻辑坐标，不是物理像素坐标）
    ctx.clearRect(0, 0, this.viewportWidth, this.viewportHeight);
    
    // 绘制背景
    ctx.fillStyle = this.styles.cellBg;
    ctx.fillRect(0, 0, this.viewportWidth, this.viewportHeight);
    
    // 绘制表头
    // ID列头 - 使用与其他列一致的坐标计算方式
    const idColumnWidth = this.getIdColumnWidth();
    const idHeaderX = -this.scrollX;
    if (idHeaderX + idColumnWidth > 0 && idHeaderX < this.viewportWidth) {
      // 确保绘制位置不为负（当 scrollX > 0 时）
      const actualX = Math.max(0, idHeaderX);
      const actualWidth = idHeaderX < 0 ? idColumnWidth + idHeaderX : idColumnWidth;
      if (actualWidth > 0) {
        this.drawCell(ctx, actualX, 0, actualWidth, HEADER_HEIGHT, "ID", true);
      }
    }
    
    // 其他列头 - 直接遍历所有列，在绘制时检查可见性
    let colX = idColumnWidth - this.scrollX;
    for (let colIdx = 0; colIdx < this.table.columns.length; colIdx++) {
      const col = this.table.columns[colIdx];
      const width = this.columnWidths[col.key] || DEFAULT_COLUMN_WIDTH;
      
      if (colX + width > 0 && colX < this.viewportWidth) {
        this.drawCell(ctx, colX, 0, width, HEADER_HEIGHT, col.label, true);
      }
      colX += width;
    }
    
    // 绘制数据行 - 直接遍历所有行，在绘制时检查可见性
    for (let rowIdx = 0; rowIdx < this.rows.length; rowIdx++) {
      const row = this.rows[rowIdx];
      const rowY = HEADER_HEIGHT + (rowIdx * CELL_HEIGHT) - this.scrollY;
      
      // 跳过完全不可见的行（性能优化：只绘制可见区域）
      // 注意：这是虚拟化渲染，如果移除这个检查会渲染所有行，影响性能
      if (rowY + CELL_HEIGHT < 0 || rowY > this.viewportHeight) continue;
      
      // ID单元格 - 使用与其他列一致的坐标计算方式
      const idColumnWidth = this.getIdColumnWidth();
      const idCellX = -this.scrollX;
      if (idCellX + idColumnWidth > 0 && idCellX < this.viewportWidth) {
        // 确保绘制位置不为负（当 scrollX > 0 时）
        const actualX = Math.max(0, idCellX);
        const actualWidth = idCellX < 0 ? idColumnWidth + idCellX : idColumnWidth;
        if (actualWidth > 0) {
          this.drawCell(ctx, actualX, rowY, actualWidth, CELL_HEIGHT, String(row.row_id), false);
        }
      }
      
      // 数据单元格 - 直接遍历所有列，在绘制时检查可见性
      colX = idColumnWidth - this.scrollX;
      for (let colIdx = 0; colIdx < this.table.columns.length; colIdx++) {
        const col = this.table.columns[colIdx];
        const width = this.columnWidths[col.key] || DEFAULT_COLUMN_WIDTH;
        
        if (colX + width > 0 && colX < this.viewportWidth) {
          const value = this.formatCellValue(row.cells[col.key] || "", col);
          this.drawCell(ctx, colX, rowY, width, CELL_HEIGHT, value, false);
        }
        colX += width;
      }
    }
    
    // 清理缓存
    this.cleanupTileCache();
  }
  
  // 格式化单元格值
  private formatCellValue(value: string, col: typeof this.table.columns[0]): string {
    if (!value) return "";
    
    const columnType = col.type || "text";
    
    switch (columnType) {
      case "date":
        return value;
      case "multi_select":
        return value.split(",").filter(v => v).join(", ");
      default:
        return value;
    }
  }
  
  // 根据坐标获取单元格位置
  getCellAt(x: number, y: number): { rowIndex: number; colKey: string | null } | null {
    if (y < HEADER_HEIGHT) {
      return null; // 表头区域
    }
    
    const rowIndex = Math.floor((y - HEADER_HEIGHT + this.scrollY) / CELL_HEIGHT);
    if (rowIndex < 0 || rowIndex >= this.rows.length) {
      return null;
    }
    
    // 检查是否点击在ID列
    const idColumnWidth = this.getIdColumnWidth();
    const adjustedX = x + this.scrollX;
    if (adjustedX >= 0 && adjustedX < idColumnWidth) {
      return { rowIndex, colKey: null }; // ID列
    }
    
    // 查找数据列
    let colX = idColumnWidth;
    for (const col of this.table.columns) {
      const width = this.columnWidths[col.key] || DEFAULT_COLUMN_WIDTH;
      if (adjustedX >= colX && adjustedX < colX + width) {
        return { rowIndex, colKey: col.key };
      }
      colX += width;
    }
    
    return null;
  }
  
  // 获取单元格的屏幕坐标
  getCellRect(rowIndex: number, colKey: string | null): { x: number; y: number; width: number; height: number } | null {
    if (rowIndex < 0 || rowIndex >= this.rows.length) {
      return null;
    }
    
    const idColumnWidth = this.getIdColumnWidth();
    let x = 0;
    let width = idColumnWidth;
    
    if (colKey) {
      x = idColumnWidth;
      for (const col of this.table.columns) {
        const colWidth = this.columnWidths[col.key] || DEFAULT_COLUMN_WIDTH;
        if (col.key === colKey) {
          width = colWidth;
          break;
        }
        x += colWidth;
      }
    }
    
    const y = HEADER_HEIGHT + (rowIndex * CELL_HEIGHT) - this.scrollY;
    const height = CELL_HEIGHT;
    
    return { 
      x: x - this.scrollX, 
      y: y, 
      width, 
      height 
    };
  }
}

export function CanvasSpreadsheetTableView({
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
}: CanvasSpreadsheetTableViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CanvasTableRenderer | null>(null);
  
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
    // 先过滤掉已标记删除的行，再应用筛选条件
    return rows
      .filter(row => !(row as any)._deleted)
      .filter(row => applyFilter(row, filterGroups));
  }, [rows, filterGroups, applyFilter]);

  // 初始化渲染器
  useEffect(() => {
    if (canvasRef.current && table && filteredRows.length >= 0) {
      try {
        rendererRef.current = new CanvasTableRenderer(
          canvasRef.current,
          table,
          filteredRows,
          columnWidths
        );
        rendererRef.current.render();
      } catch (error) {
        console.error("Canvas 渲染器初始化失败:", error);
      }
    }
  }, [table?.id, table?.columns, filteredRows.length, columnWidths]);

  // 解析 Excel 文件
  const parseExcelFile = useCallback(async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1,
            defval: ""
          }) as any[][];
          
          if (jsonData.length < 2) {
            setErrorMessage("Excel 文件至少需要包含标题行和一行数据");
            setErrorDialogOpen(true);
            return;
          }
          
          const headers = (jsonData[0] as any[])?.filter(h => h !== null && h !== undefined && String(h).trim() !== "") || [];
          if (headers.length === 0) {
            setErrorMessage("Excel 文件的第一行（标题行）为空，请检查文件格式");
            setErrorDialogOpen(true);
            return;
          }
          
          // 保存 Excel 数据
          setExcelHeaders(headers.map(h => String(h).trim()));
          setExcelData(jsonData.slice(1));
          
          // 判断表格状态
          const isNewTable = rows.length === 0 && table.columns.length === 0;
          
          if (isNewTable) {
            // 情况1：新表格，显示列定义对话框
            const generateKeyFromLabel = (label: string, existingKeys: Set<string>): string => {
              let key = label.trim();
              if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) && !existingKeys.has(key)) {
                return key;
              }
              key = key.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase();
              if (!key || !/^[a-zA-Z_]/.test(key)) {
                key = 'col_' + key;
              }
              let finalKey = key;
              let counter = 1;
              while (existingKeys.has(finalKey)) {
                finalKey = `${key}_${counter}`;
                counter++;
              }
              return finalKey;
            };
            
            const existingKeys = new Set<string>();
            const mappings = headers.map(header => {
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
            setColumnMappingDialogOpen(true);
            setImportDialogOpen(false);
          } else {
            // 情况2：已有表格，检查列是否一致
            const normalize = (str: string | null | undefined): string => {
              if (!str) return "";
              return String(str).trim().toLowerCase();
            };
            
            const excelHeaderSet = new Set(headers.map(h => normalize(String(h))));
            const tableColumnSet = new Set(table.columns.map(col => normalize(col.key)));
            
            // 检查列是否一致（比较 key）
            const excelKeys = headers.map(h => {
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
            
            const allMatched = excelKeys.every(key => key !== null) && excelKeys.length === table.columns.length;
            
            if (allMatched) {
              // 列一致，询问覆盖还是追加
              setImportModeDialogOpen(true);
              setImportDialogOpen(false);
            } else {
              // 列不一致，只能覆盖 - 显示确认对话框
              setColumnMismatchDialogOpen(true);
              setImportDialogOpen(false);
            }
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
  }, [table, rows]);
  
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
  const handleFileImport = useCallback(async (file: File) => {
    await parseExcelFile(file);
  }, [parseExcelFile]);

  // 更新数据和滚动位置（使用筛选后的行）
  useEffect(() => {
    if (rendererRef.current && table && filteredRows) {
      rendererRef.current.updateData(table, filteredRows);
      rendererRef.current.setColumnWidths(columnWidths);
      rendererRef.current.setScroll(scrollX, scrollY);
      rendererRef.current.render();
    }
  }, [table, table?.columns?.length, filteredRows, scrollX, scrollY, columnWidths]);
  
  // 处理窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      if (rendererRef.current) {
        rendererRef.current.resizeCanvas();
        rendererRef.current.render();
      }
      
      // 窗口大小变化时，更新 totalHeight 并检查滚动位置，避免底部空白
      if (containerRef.current && filteredRows.length >= 0) {
        const viewportHeight = containerRef.current.clientHeight;
        const addRowButtonHeight = CELL_HEIGHT;
        const totalContentHeight = HEADER_HEIGHT + (filteredRows.length * CELL_HEIGHT) + addRowButtonHeight;
        // 更新 totalHeight，确保至少等于视口高度
        const newTotalHeight = Math.max(totalContentHeight, viewportHeight);
        setTotalHeight(newTotalHeight);
        
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
  }, [filteredRows.length, scrollY]);
  
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
  }, [filteredRows.length]);
  
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
  
  // 动态计算内容区域高度，确保当内容高度小于视口高度时，至少等于视口高度
  const [totalHeight, setTotalHeight] = useState(() => {
    const contentHeight = HEADER_HEIGHT + (filteredRows.length * CELL_HEIGHT);
    const addRowButtonHeight = CELL_HEIGHT;
    return contentHeight + addRowButtonHeight;
  });
  
  useEffect(() => {
    if (containerRef.current) {
      const viewportHeight = containerRef.current.clientHeight;
      // 如果内容高度小于视口高度，使用视口高度，避免底部空白
      const newTotalHeight = Math.max(actualContentHeight, viewportHeight);
      setTotalHeight(newTotalHeight);
    }
  }, [actualContentHeight]);
  
  // 格式化显示值（用于编辑器的显示）
  const formatDisplayValue = useCallback((value: string, col: typeof table.columns[0]) => {
    if (!value) return "";
    
    const columnType = col.type || "text";
    
    switch (columnType) {
      case "date":
        return value;
      case "multi_select":
        return value.split(",").filter(v => v).join(", ");
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
              setTimeout(() => {
                if (multiSelectTriggerRef.current) {
                  const width = multiSelectTriggerRef.current.offsetWidth;
                  setPopoverWidth(width);
                }
              }, 0);
            } else {
              setMultiSelectOpen(null);
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
            </PopoverTrigger>
            <PopoverContent className="p-1" align="start" style={{ width: `${popoverWidth}px`, minWidth: `${popoverWidth}px` }}>
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
            </PopoverContent>
          </Popover>
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
                      <Plus className="h-3 w-3 mr-1" />
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
                <Plus className="h-4 w-4 mr-1" />
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
      
      {/* Canvas 表格容器 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative min-h-0 custom-scrollbar"
        onScroll={handleScroll}
      >
        <div style={{ width: totalWidth, height: totalHeight, position: "relative" }}>
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0"
            style={{ width: "100%", height: "100%" }}
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
          
          {/* ID列宽调整手柄 */}
          {(() => {
            const idColX = Math.max(0, -scrollX);
            const idWidth = columnWidths[ID_COLUMN_KEY] || DEFAULT_ID_COLUMN_WIDTH;
            if (idColX + idWidth > 0 && idColX < (containerRef.current?.clientWidth || 0)) {
              return (
                <div
                  key="id-column-resize"
                  className="absolute top-0 cursor-col-resize hover:bg-primary/50 transition-colors z-30"
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
                      className="absolute top-0 z-40"
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
                  )}
                  {/* 列宽调整手柄 */}
                  <div
                    className="absolute top-0 cursor-col-resize hover:bg-primary/50 transition-colors z-30"
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
                className="absolute top-0 z-30 bg-muted border-0"
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
            className="absolute z-30 bg-muted/30 border border-border"
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
              <Plus className="h-4 w-4 mr-2" />
              添加行
            </Button>
          </div>
          
          {/* 单元格编辑覆盖层 */}
          {editingCell && cellEditorRect && (
            <div
              className="absolute border-2 border-blue-500 bg-white z-50 shadow-lg"
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
          
          {/* 删除行按钮（悬浮显示）- 在每行的最右侧列中 */}
          {onDeleteRow && hoveredRowIndex !== null && hoveredRowIndex >= 0 && hoveredRowIndex < filteredRows.length && (
            <div
              data-overlay
              className="absolute z-40 transition-opacity"
              style={{
                left: `${totalWidth - scrollX}px`, // 在表格最右侧边缘
                top: `${HEADER_HEIGHT + (hoveredRowIndex * CELL_HEIGHT) - scrollY + CELL_HEIGHT / 2}px`,
                transform: "translate(-50%, -50%)", // 居中定位，类似原设计的 right-1/2 translate-x-1/2
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
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 bg-background/90 shadow-sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const row = filteredRows[hoveredRowIndex];
                  if (row && onDeleteRow) {
                    onDeleteRow(row);
                  }
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                title="删除这一行"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
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
        <>
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
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto custom-scrollbar">
              <DialogHeader>
                <DialogTitle>定义列信息</DialogTitle>
                <DialogDescription>
                  {importMode === "replace" 
                    ? "请为 Excel 中的每一列定义列 Key、数据类型和默认值。导入将替换所有现有数据，此操作不可恢复。"
                    : "请为 Excel 中的每一列定义列 Key、数据类型和默认值。列 Key 将用于数据存储，建议使用英文和下划线。"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  {columnMappings.map((mapping, index) => (
                    <div key={index} className="p-3 border rounded-lg space-y-3">
                      <div className="flex items-center gap-4">
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
              <DialogFooter>
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
            <DialogContent>
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
                      const col = table.columns.find(c => {
                        const normalize = (str: string) => String(str).trim().toLowerCase();
                        return (
                          headerStr === c.label ||
                          headerStr === c.key ||
                          normalize(headerStr) === normalize(c.label) ||
                          normalize(headerStr) === normalize(c.key)
                        );
                      });
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
            <DialogContent>
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
                    // 创建初始列映射，然后显示列映射对话框让用户确认/修改
                    const generateKeyFromLabel = (label: string, existingKeys: Set<string>): string => {
                      let key = label.trim();
                      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) && !existingKeys.has(key)) {
                        return key;
                      }
                      key = key.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase();
                      if (!key || !/^[a-zA-Z_]/.test(key)) {
                        key = 'col_' + key;
                      }
                      let finalKey = key;
                      let counter = 1;
                      while (existingKeys.has(finalKey)) {
                        finalKey = `${key}_${counter}`;
                        counter++;
                      }
                      return finalKey;
                    };
                    
                    const existingKeys = new Set(table.columns.map(col => col.key));
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
        </>
      )}
    </div>
  );
}
