"use client";

/**
 * TableCanvasView - 基于 TableCanvasModel 的单 Canvas 多维表格视图
 *
 * 设计原则：
 * 1. 仅一个 Canvas 负责渲染表头 + 内容
 * 2. 表头和内容都是 Canvas 的一部分
 * 3. 页面加载时通过 DOM 固定高度计算是否需要滚动条
 * 4. 需要时生成 DOM 虚拟滚动条（react-custom-scrollbars-4）
 * 5. 纵向滚动条按表头位置定位（top: HEADER_HEIGHT）
 * 6. 监听滚动 → 反馈给 Canvas 重绘
 * 7. 通过 scroll 计算 body 裁剪（虚拟化）
 */

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import { Scrollbars } from "react-custom-scrollbars-4";
import { Plus, Trash2, Pencil, ChevronRightIcon, Undo2, Redo2, Save, Upload, Filter, Search } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/shared/theme-provider";
import {
  createCanvasGridRenderer,
  type GridColumn,
  type GridRow,
  type CanvasGridRendererInstance,
} from "@/lib/canvas-grid-renderer";
import type { MultiDimensionTable, TableRow as TableRowType, TableColumn as TableColumnType } from "@/lib/api/multi-dimension-tables";
import type { TableCanvasModel } from "@/lib/table-canvas-model";
import { generateKeyFromLabel, normalize } from "@/lib/utils/string";
import { parseExcelFile, ExcelParseError } from "@/lib/utils/excel-parser";
import {
  CELL_HEIGHT,
  HEADER_HEIGHT,
  HEADER_ICON_WIDTH,
  ID_COLUMN_KEY,
  ADD_COLUMN_WIDTH,
  DEFAULT_ID_COLUMN_WIDTH,
  SCROLLBAR_SIZE,
  loadColumnWidthsFromStorage,
  saveColumnWidthsToStorage,
  loadPinnedColumnsFromStorage,
  savePinnedColumnsToStorage,
} from "./table-canvas-constants";
import { toGridColumns, toGridRows, DEFAULT_COLUMN_WIDTH, ADD_COLUMN_KEY, formatTableCellValue } from "./table-canvas-utils";
import { useTableCanvasFilter } from "./use-table-canvas-filter";
import { TableCanvasToolbar } from "./table-canvas-toolbar";
import { TableCanvasRowContextMenu } from "./table-canvas-row-context-menu";
import { TableCanvasDeleteColumnDialog } from "./table-canvas-delete-column-dialog";
import { TableCanvasCellEditor } from "./table-canvas-cell-editor";
import { TableCanvasColumnHeaderMenu } from "./table-canvas-column-header-menu";
import { TableCanvasImportDialogs, type ImportColumnMapping } from "./table-canvas-import-dialogs";
import { TableCanvasFilterPopover } from "./table-canvas-filter-popover";
import { TableCanvasIdColumn } from "./table-canvas-id-column";
import { TableCanvasVerticalScrollbar, TableCanvasHorizontalScrollbar } from "./table-canvas-custom-scrollbars";
import { TableCanvasColumnDragOverlays } from "./table-canvas-column-drag-overlays";
import { useTableCanvasScrollbarHover } from "./use-table-canvas-scrollbar-hover";
import { TableCanvasColumnHeaderOverlay } from "./table-canvas-column-header-overlay";

export interface TableCanvasViewProps {
  /** 可选：传入后以 TableCanvasModel 为数据源，table/rows/columnWidths/canUndo/canRedo 来自 model，操作通过 model 方法回写 */
  model?: TableCanvasModel;
  table?: MultiDimensionTable;
  rows?: TableRowType[];
  loading?: boolean;
  onCellChange?: (rowId: string, columnKey: string, value: string) => void;
  onAddRow: () => void;
  onAddColumn?: () => void;
  onDeleteColumn: (columnKey: string) => void;
  onEditColumn: (columnKey: string) => void;
  /** 在指定列左侧插入新列 */
  onInsertColumnLeft?: (columnKey: string) => void;
  /** 在指定列右侧插入新列 */
  onInsertColumnRight?: (columnKey: string) => void;
  /** 复制指定列 */
  onCopyColumn?: (columnKey: string) => void;
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
  onImportColumns?: (
    columns: Array<{ key: string; label: string; type?: string; defaultValue?: string }>,
    mode?: "append" | "replace"
  ) => void;
  /** 表头列拖拽排序后回调，传入新的列 key 顺序 */
  onReorderColumns?: (columnKeys: string[]) => void;
  /** 在保存按钮左侧插入的自定义内容（如历史记录按钮） */
  toolbarExtraLeftOfSave?: React.ReactNode;
  /** 隐藏列 Popover 内容（在「按条件」右侧显示「隐藏列」按钮） */
  columnVisibilityPopoverContent?: React.ReactNode;
  /** 当前隐藏的列数量（用于「隐藏列」按钮徽章） */
  columnVisibilityHiddenCount?: number;
  /** 只读模式：禁用单元格编辑、增删列、行右键菜单等交互与工具栏 */
  readOnly?: boolean;
  /** 是否启用列宽的本地持久化（localStorage）；工作台只读视图可关闭 */
  persistColumnWidths?: boolean;
  /** 初始列宽配置（用于工作台从 dashboard-config 还原列宽） */
  initialColumnWidths?: Record<string, number>;
  /** 列宽变化时回调（用于工作台写回 dashboard-config） */
  onColumnWidthsChange?: (widths: Record<string, number>) => void;
  /** 固定在左侧的列 keys（可选，由父组件控制） */
  pinnedLeftColumns?: string[];
  /** 固定在左侧的列变化时回调（可选，由父组件持久化） */
  onPinnedLeftColumnsChange?: (keys: string[]) => void;
  /** 隐藏的列 keys（不参与渲染，由父组件从 localStorage 等维护） */
  hiddenColumnKeys?: string[];
  /** 隐藏 ID 列（用于只读简单表格，如缴费记录） */
  hideIdColumn?: boolean;
}

export function TableCanvasView({
  model,
  table: tableProp,
  rows: rowsProp,
  loading = false,
  onCellChange,
  onAddRow,
  onAddColumn,
  onDeleteColumn,
  onEditColumn,
  onInsertColumnLeft,
  onInsertColumnRight,
  onCopyColumn,
  onEditByCondition,
  onDeleteByCondition,
  onQueryByCondition,
  onEditRow,
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
  onReorderColumns,
  toolbarExtraLeftOfSave,
  columnVisibilityPopoverContent,
  columnVisibilityHiddenCount = 0,
  readOnly = false,
  persistColumnWidths = true,
  initialColumnWidths,
  onColumnWidthsChange,
  pinnedLeftColumns,
  onPinnedLeftColumnsChange,
  hiddenColumnKeys,
  hideIdColumn = false,
}: TableCanvasViewProps) {
  const snapshot = model
    ? useSyncExternalStore(
        (listener) => model.subscribe(listener),
        () => model.getSnapshot(),
        () => model.getSnapshot()
      )
    : null;
  const effectiveTable = (model ? snapshot!.table : tableProp) ?? null;
  const effectiveRows = (model ? snapshot!.rows : rowsProp) ?? [];
  const effectiveColumnWidthsFromModel = model ? snapshot!.columnWidths : null;

  /** 排除隐藏列后的列（用于表头/表格体渲染、筛选等） */
  const visibleColumns = useMemo(() => {
    const cols = effectiveTable?.columns ?? [];
    if (!hiddenColumnKeys?.length) return cols;
    return cols.filter((c) => !hiddenColumnKeys.includes(c.key));
  }, [effectiveTable?.columns, hiddenColumnKeys]);
  const effectiveCanUndo = model ? snapshot!.canUndo : canUndo;
  const effectiveCanRedo = model ? snapshot!.canRedo : canRedo;
  const effectiveOnCellChange = model
    ? (rowId: string, columnKey: string, value: string) => model.updateCell(rowId, columnKey, value)
    : (onCellChange ?? (() => {}));
  const effectiveOnUndo = model ? () => model.undo() : (onUndo ?? (() => {}));
  const effectiveOnRedo = model ? () => model.redo() : (onRedo ?? (() => {}));
  const effectiveOnReorderColumns = model
    ? (columnKeys: string[]) => model.reorderColumns(columnKeys)
    : onReorderColumns;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasOverlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollbarsRef = useRef<Scrollbars>(null);
  const rendererRef = useRef<CanvasGridRendererInstance | null>(null);
  const rafRef = useRef<number | null>(null);
  const { theme } = useTheme();

  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnKey: string } | null>(null);
  const [cellValue, setCellValue] = useState("");
  /** 进入编辑时该格子的原始值，用于 blur 时判断是否发生修改 */
  const editingCellOriginalValueRef = useRef<string>("");
  const [cellEditorRect, setCellEditorRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [localColumnWidths, setLocalColumnWidths] = useState<Record<string, number>>({
    [ID_COLUMN_KEY]: DEFAULT_ID_COLUMN_WIDTH,
  });
  const columnWidths = effectiveColumnWidthsFromModel ?? localColumnWidths;
  const effectiveIdColumnWidth = hideIdColumn ? 0 : (columnWidths[ID_COLUMN_KEY] ?? DEFAULT_ID_COLUMN_WIDTH);

  // 外部传入的初始列宽（如工作台 dashboard-config 中的配置）
  // 仅在存在差异时才合并，避免造成无限更新
  useEffect(() => {
    if (!initialColumnWidths) return;
    setLocalColumnWidths((prev) => {
      let changed = false;
      const next: Record<string, number> = { ...prev };
      for (const [key, value] of Object.entries(initialColumnWidths)) {
        if (typeof value === "number" && value > 0 && next[key] !== value) {
          next[key] = value;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [initialColumnWidths]);
  const setColumnWidthsOrModel = useCallback(
    (key: string, width: number) => {
      if (model) model.setColumnWidth(key, width);
      else setLocalColumnWidths((prev) => ({ ...prev, [key]: width }));
    },
    [model]
  );
  const setColumnWidthsBatch = useCallback(
    (next: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
      if (model) {
        const resolved = typeof next === "function" ? next(model.getSnapshot().columnWidths) : next;
        Object.entries(resolved).forEach(([k, w]) => model.setColumnWidth(k, w));
      } else {
        setLocalColumnWidths(typeof next === "function" ? next : (prev) => ({ ...prev, ...next }));
      }
    },
    [model]
  );
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [deleteColumnDialogOpen, setDeleteColumnDialogOpen] = useState(false);
  const [columnToDelete, setColumnToDelete] = useState<{ key: string; label: string } | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const scrollStateRef = useRef({ scrollX: 0, scrollY: 0 });
  const [multiSelectOpen, setMultiSelectOpen] = useState<{ rowId: string; columnKey: string } | null>(null);
  const [popoverWidth, setPopoverWidth] = useState(200);
  const multiSelectTriggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [columnMappingDialogOpen, setColumnMappingDialogOpen] = useState(false);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [columnMenuOpen, setColumnMenuOpen] = useState<string | null>(null);
  const [hoveredColumnKey, setHoveredColumnKey] = useState<string | null>(null);
  const [canvasCursor, setCanvasCursor] = useState<string>("default");
  const lastMouseDownWasResizeRef = useRef(false);
  const horizontalDragRef = useRef<{ thumbWidth: number; prevPageX: number } | null>(null);
  const verticalDragRef = useRef<{ thumbHeight: number; prevPageY: number } | null>(null);
  const resizingColumnRef = useRef<string | null>(null);
  const [resizeLineX, setResizeLineX] = useState<number | null>(null);
  const {
    isHoveringTableArea,
    setIsHoveringTableArea,
    hoverLeaveTimeoutRef,
    onScrollbarMouseEnter,
    onScrollbarMouseLeave,
  } = useTableCanvasScrollbarHover();
  /** 移动端/触摸设备无 hover，滚动条需常显 */
  const [isTouchDevice] = useState(
    () => typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0)
  );
  const showScrollbars = isHoveringTableArea || isTouchDevice;
  const hoveredColumnClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draggingColumnKey, setDraggingColumnKey] = useState<string | null>(null);
  const [dropTargetColumnKey, setDropTargetColumnKey] = useState<string | null>(null);
  const [dragOverlayX, setDragOverlayX] = useState<number | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const didReorderRef = useRef(false);
  const dropTargetColumnKeyRef = useRef<string | null>(null);
  const [singleSelectOpen, setSingleSelectOpen] = useState(false);
  const [conditionMenuOpen, setConditionMenuOpen] = useState(false);
  /** 行右键菜单：在内容区右击时显示编辑/删除 */
  const [rowContextMenu, setRowContextMenu] = useState<{ row: TableRowType; x: number; y: number } | null>(null);
  const rowContextMenuRef = useRef<HTMLDivElement>(null);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const {
    filterGroups,
    setFilterGroups,
    filteredRows,
  } = useTableCanvasFilter(effectiveRows);

  useEffect(() => {
    if (effectiveTable?.id === "team-quota-payment-logs") {
      console.log("[TableCanvasView] effectiveRows:", effectiveRows?.length, effectiveRows);
      console.log("[TableCanvasView] filteredRows:", filteredRows?.length, filteredRows);
    }
  }, [effectiveTable?.id, effectiveRows, filteredRows]);

  /** 固定在左侧的列（默认使用外部传入的 pinnedLeftColumns，若未传则仅在本地状态中维护） */
  const [pinnedLeftColumnsState, setPinnedLeftColumnsState] = useState<string[]>(pinnedLeftColumns ?? []);

  useEffect(() => {
    if (!pinnedLeftColumns) return;
    setPinnedLeftColumnsState(pinnedLeftColumns);
  }, [pinnedLeftColumns]);

  // 多维表格详情页：从 localStorage 恢复固定列（仅当未受控且启用列宽持久化时）
  useEffect(() => {
    if (pinnedLeftColumns != null || !persistColumnWidths || !effectiveTable?.id) return;
    const saved = loadPinnedColumnsFromStorage(effectiveTable.id);
    if (saved?.length) setPinnedLeftColumnsState(saved);
  }, [effectiveTable?.id, persistColumnWidths, pinnedLeftColumns]);

  // 多维表格详情页：固定列变化时写回 localStorage（防抖）
  useEffect(() => {
    if (!persistColumnWidths || !effectiveTable?.id || pinnedLeftColumns != null) return;
    const t = setTimeout(() => {
      savePinnedColumnsToStorage(effectiveTable.id, pinnedLeftColumnsState);
    }, 200);
    return () => clearTimeout(t);
  }, [effectiveTable?.id, persistColumnWidths, pinnedLeftColumns, pinnedLeftColumnsState]);

  // 导入 Excel 其余状态（importDialogOpen/columnMappingDialogOpen/errorDialogOpen/errorMessage 已在上方声明）
  const [importModeDialogOpen, setImportModeDialogOpen] = useState(false);
  const [columnMismatchDialogOpen, setColumnMismatchDialogOpen] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelData, setExcelData] = useState<unknown[][]>([]);
  const [columnMappings, setColumnMappings] = useState<Array<{ excelHeader: string; key: string; label: string; type: string; defaultValue: string }>>([]);
  const [isDragging, setIsDragging] = useState(false);

  /** 固定列按表格列顺序排列（仅从可见列中取） */
  const pinnedColsOrdered = useMemo(() => {
    if (!visibleColumns.length || !pinnedLeftColumnsState.length) return [];
    return visibleColumns.filter((c) => pinnedLeftColumnsState.includes(c.key));
  }, [visibleColumns, pinnedLeftColumnsState]);

  /** 固定列总宽（按表序求和，与左侧固定区 DOM 一致） */
  const totalPinnedWidth = useMemo(() => {
    if (!pinnedColsOrdered.length) return 0;
    return pinnedColsOrdered.reduce(
      (sum, col) => sum + (columnWidths[col.key] ?? DEFAULT_COLUMN_WIDTH),
      0
    );
  }, [pinnedColsOrdered, columnWidths]);

  const totalWidth = useMemo(() => {
    if (!visibleColumns.length && !effectiveTable?.columns?.length) return effectiveIdColumnWidth;
    const dataWidth = visibleColumns.reduce((sum, col) => sum + (columnWidths[col.key] ?? DEFAULT_COLUMN_WIDTH), 0);
    const addColWidth = onAddColumn ? ADD_COLUMN_WIDTH : 0;
    return effectiveIdColumnWidth + dataWidth + addColWidth;
  }, [visibleColumns, columnWidths, onAddColumn, effectiveTable?.columns?.length, effectiveIdColumnWidth]);

  // 按多维表格 id 从 localStorage 恢复列宽（仅列宽，每次刷新/表格切换时合并）
  useEffect(() => {
    if (!persistColumnWidths) return;
    if (!effectiveTable?.id || !effectiveTable?.columns?.length) return;
    const saved = loadColumnWidthsFromStorage(effectiveTable.id);
    const applySaved = (prev: Record<string, number>) => {
      const next: Record<string, number> = {
        [ID_COLUMN_KEY]:
          typeof saved?.[ID_COLUMN_KEY] === "number" && saved[ID_COLUMN_KEY]! > 0
            ? saved[ID_COLUMN_KEY]!
            : prev[ID_COLUMN_KEY] ?? DEFAULT_ID_COLUMN_WIDTH,
      };
      effectiveTable!.columns.forEach((col) => {
        const w = saved?.[col.key] ?? prev[col.key];
        next[col.key] = typeof w === "number" && w >= 50 ? w : DEFAULT_COLUMN_WIDTH;
      });
      return next;
    };
    if (model) model.setColumnWidths(applySaved(model.getSnapshot().columnWidths));
    else setLocalColumnWidths((prev) => applySaved(prev));
  }, [effectiveTable?.id, effectiveTable?.columns?.length, model, persistColumnWidths]);

  // 列宽变化时写回 localStorage（防抖，只持久化当前表的列宽）
  useEffect(() => {
    if (!persistColumnWidths) return;
    if (!effectiveTable?.id) return;
    const t = setTimeout(() => {
      const toSave: Record<string, number> = {};
      const idW = columnWidths[ID_COLUMN_KEY];
      if (typeof idW === "number" && idW > 0) toSave[ID_COLUMN_KEY] = idW;
      effectiveTable?.columns?.forEach((col) => {
        const w = columnWidths[col.key];
        if (typeof w === "number" && w >= 50) toSave[col.key] = w;
      });
      if (Object.keys(toSave).length > 0) saveColumnWidthsToStorage(effectiveTable.id, toSave);
    }, 300);
    return () => clearTimeout(t);
  }, [effectiveTable?.id, effectiveTable?.columns, columnWidths, persistColumnWidths]);

  // 列宽变化时通知外部（例如工作台写回 dashboard-config），带轻微防抖
  useEffect(() => {
    if (!onColumnWidthsChange) return;
    if (!effectiveTable?.id || !effectiveTable?.columns?.length) return;
    const t = setTimeout(() => {
      const toSave: Record<string, number> = {};
      const idW = columnWidths[ID_COLUMN_KEY];
      if (typeof idW === "number" && idW > 0) toSave[ID_COLUMN_KEY] = idW;
      effectiveTable.columns.forEach((col) => {
        const w = columnWidths[col.key];
        if (typeof w === "number" && w >= 50) toSave[col.key] = w;
      });
      if (Object.keys(toSave).length > 0) {
        onColumnWidthsChange(toSave);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [columnWidths, effectiveTable?.id, effectiveTable?.columns, onColumnWidthsChange]);

  const totalBodyHeight = useMemo(
    () => filteredRows.length * CELL_HEIGHT,
    [filteredRows.length]
  );

  /** 传给 Canvas 的列：仅可见列，排除固定列，只绘制可横向滚动的列 */
  const gridColumns = useMemo(() => {
    if (!effectiveTable || !columnWidths || !visibleColumns.length) return [];
    const tableWithVisible = { ...effectiveTable, columns: visibleColumns };
    const all = toGridColumns(tableWithVisible, columnWidths, { onAddColumn });
    if (!pinnedLeftColumnsState.length) return all;
    return all.filter((col) => !pinnedLeftColumnsState.includes(col.key));
  }, [effectiveTable, visibleColumns, columnWidths, onAddColumn, pinnedLeftColumnsState]);
  const gridRows = useMemo(
    () => (effectiveTable && filteredRows ? toGridRows(filteredRows, effectiveTable) : []),
    [effectiveTable?.id, effectiveTable?.columns, filteredRows]
  );

  scrollStateRef.current = { scrollX, scrollY };

  /** 固定列 key+width（表序），供 Canvas 在固定区 hit-test 表头列 */
  const pinnedColumnsForRenderer = useMemo(
    () =>
      pinnedColsOrdered.map((col) => ({
        key: col.key,
        width: columnWidths[col.key] ?? DEFAULT_COLUMN_WIDTH,
      })),
    [pinnedColsOrdered, columnWidths]
  );

  const createRenderer = useMemo(() => {
    const themeEl = () => containerRef.current ?? document.documentElement;
    return createCanvasGridRenderer({
      cellHeight: CELL_HEIGHT,
      headerHeight: HEADER_HEIGHT,
      idColumnKey: ID_COLUMN_KEY,
      idColumnWidth: effectiveIdColumnWidth,
      defaultColumnWidth: DEFAULT_COLUMN_WIDTH,
      formatCellValue: (v) => v,
      useTailwindTheme: () => themeEl() ?? document.documentElement,
      headerBgSameAsCell: true,
      bodyOnly: false,
      getScroll: () => scrollStateRef.current,
      dataAreaLeftOffset: totalPinnedWidth,
      pinnedColumns: totalPinnedWidth > 0 ? pinnedColumnsForRenderer : undefined,
    });
  }, [theme, totalPinnedWidth, pinnedColumnsForRenderer, effectiveIdColumnWidth]);

  const doRender = useCallback(() => {
    if (rendererRef.current) {
      rendererRef.current.render();
    }
  }, []);

  useEffect(() => {
    const viewportEl = canvasOverlayRef.current ?? containerRef.current;
    if (canvasRef.current && viewportEl && effectiveTable && filteredRows.length >= 0) {
      try {
        if (effectiveTable.id === "team-quota-payment-logs") {
          console.log("[TableCanvasView] 初始化 renderer, gridColumns:", gridColumns.length, "gridRows:", gridRows.length, "viewport:", viewportEl?.clientWidth, "x", viewportEl?.clientHeight);
        }
        rendererRef.current = createRenderer(canvasRef.current, viewportEl);
        rendererRef.current.resize();
        rendererRef.current.updateData(gridColumns, gridRows, columnWidths);
        doRender();
      } catch (e) {
        console.error("Canvas 渲染器初始化失败:", e);
      }
    }
  }, [effectiveTable?.id, effectiveTable?.columns?.length, filteredRows.length, columnWidths, gridColumns, gridRows, createRenderer]);

  useLayoutEffect(() => {
    if (rendererRef.current && gridColumns.length >= 0 && containerRef.current) {
      rendererRef.current.updateData(gridColumns, gridRows, columnWidths);
      doRender();
    }
  }, [scrollX, scrollY, effectiveTable?.id, effectiveTable?.columns?.length, filteredRows, columnWidths, gridColumns, gridRows, doRender]);

  // 监听主题字符串变化（light / dark / system），重新渲染 Canvas 以应用新的 CSS 变量颜色
  useEffect(() => {
    doRender();
  }, [theme, doRender]);

  // 当 theme 为 system 时，还需要监听系统配色偏好变化
  useEffect(() => {
    if (theme !== "system") return;
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => doRender();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme, doRender]);

  // 监听 document 根节点 class 变化（主题实际应用时机），确保 DOM 更新后再重绘
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      requestAnimationFrame(() => doRender());
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [doRender]);

  const handleScrollFrame = useCallback((values: { scrollTop: number; scrollLeft: number }) => {
    setScrollY(values.scrollTop);
    setScrollX(values.scrollLeft ?? 0);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      doRender();
    });
  }, [doRender]);

  const handleCanvasWheel = useCallback((e: WheelEvent) => {
    if (resizingColumnRef.current) {
      e.preventDefault();
      return;
    }
    const sb = scrollbarsRef.current;
    if (!sb) return;
    let handled = false;
    if (e.deltaY !== 0) {
      const top = sb.getScrollTop();
      const maxTop = Math.max(0, sb.getScrollHeight() - sb.getClientHeight());
      sb.scrollTop(Math.max(0, Math.min(maxTop, top + e.deltaY)));
      handled = true;
    }
    if (e.deltaX !== 0) {
      const left = sb.getScrollLeft();
      const maxLeft = Math.max(0, sb.getScrollWidth() - sb.getClientWidth());
      sb.scrollLeft(Math.max(0, Math.min(maxLeft, left + e.deltaX)));
      handled = true;
    }
    if (handled) e.preventDefault();
  }, []);

  /** 横向轨道点击：跳到该位置（不依赖库的 addListeners，因 getScrollbarWidth()===0 时库不会绑定） */
  const handleHorizontalTrackMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault?.();
    const sb = scrollbarsRef.current;
    const track = e.currentTarget;
    if (!sb) return;
    const scrollWidth = sb.getScrollWidth();
    const clientWidth = sb.getClientWidth();
    if (scrollWidth <= clientWidth) return;
    const rect = track.getBoundingClientRect();
    const trackWidth = rect.width;
    const thumbWidth = Math.max(24, (clientWidth / scrollWidth) * trackWidth);
    const maxScroll = scrollWidth - clientWidth;
    const range = trackWidth - thumbWidth;
    if (range <= 0) return;
    const clickOffset = e.clientX - rect.left;
    const thumbCenter = clickOffset - thumbWidth / 2;
    const thumbLeft = Math.max(0, Math.min(range, thumbCenter));
    const newLeft = (thumbLeft / range) * maxScroll;
    sb.scrollLeft(newLeft);
  }, []);

  /** 横向拇指拖拽：在 getScrollbarWidth()===0 时库不绑定，这里自己实现 */
  const handleHorizontalThumbMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault?.();
    e.stopPropagation?.();
    const sb = scrollbarsRef.current;
    const thumb = e.currentTarget;
    const track = thumb.parentElement;
    if (!sb || !track) return;
    const scrollWidth = sb.getScrollWidth();
    const clientWidth = sb.getClientWidth();
    if (scrollWidth <= clientWidth) return;
    const thumbRect = thumb.getBoundingClientRect();
    const prevPageX = e.clientX - thumbRect.left;
    const thumbWidth = Math.max(24, thumbRect.width);
    horizontalDragRef.current = { thumbWidth, prevPageX };

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      const tr = track.getBoundingClientRect();
      const trackWidth = tr.width;
      const range = trackWidth - thumbWidth;
      if (range <= 0) return;
      const clientX = getClientX(moveEvent);
      const offset = clientX - tr.left - prevPageX;
      const maxScroll = scrollWidth - clientWidth;
      const newLeft = Math.max(0, Math.min(maxScroll, (offset / range) * maxScroll));
      sb.scrollLeft(newLeft);
      if ("touches" in moveEvent) moveEvent.preventDefault();
    };
    const onEnd = () => {
      horizontalDragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
  }, []);

  const handleHorizontalTrackTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) return;
    e.preventDefault();
    const syntheticEvent = { clientX: e.touches[0]!.clientX, currentTarget: e.currentTarget } as unknown as React.MouseEvent<HTMLDivElement>;
    handleHorizontalTrackMouseDown(syntheticEvent);
  }, [handleHorizontalTrackMouseDown]);

  const handleHorizontalThumbTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const syntheticEvent = { clientX: e.touches[0]!.clientX, preventDefault: () => {}, stopPropagation: () => {}, currentTarget: e.currentTarget } as unknown as React.MouseEvent<HTMLDivElement>;
    handleHorizontalThumbMouseDown(syntheticEvent);
  }, [handleHorizontalThumbMouseDown]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleCanvasWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleCanvasWheel);
  }, [handleCanvasWheel]);

  const handleResizeStart = useCallback(
    (e: { clientX: number; preventDefault?: () => void; stopPropagation?: () => void }, columnKey: string) => {
      e.preventDefault?.();
      e.stopPropagation?.();
      setResizingColumn(columnKey);
      resizingColumnRef.current = columnKey;
      setResizeStartX(e.clientX);
      const defaultWidth = columnKey === ID_COLUMN_KEY ? DEFAULT_ID_COLUMN_WIDTH : DEFAULT_COLUMN_WIDTH;
      setResizeStartWidth(columnWidths[columnKey] || defaultWidth);
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setResizeLineX(e.clientX - rect.left);
      }
    },
    [columnWidths]
  );

  useEffect(() => {
    resizingColumnRef.current = resizingColumn;
  }, [resizingColumn]);

  useEffect(() => {
    return () => {
      if (hoverLeaveTimeoutRef.current) clearTimeout(hoverLeaveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!draggingColumnKey) return;
    const handleMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDragOverlayX(e.clientX - rect.left);
      }
      if (!canvasRef.current || !rendererRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (y >= HEADER_HEIGHT) {
        dropTargetColumnKeyRef.current = null;
        setDropTargetColumnKey(null);
        return;
      }
      const col = rendererRef.current.getHeaderColumnAt(x, y);
      if (col && col !== ADD_COLUMN_KEY && col !== ID_COLUMN_KEY) {
        dropTargetColumnKeyRef.current = col;
        setDropTargetColumnKey(col);
      } else {
        dropTargetColumnKeyRef.current = null;
        setDropTargetColumnKey(null);
      }
    };
    const handleUp = (e: MouseEvent) => {
      const dropTarget = dropTargetColumnKeyRef.current;
      if (
        effectiveOnReorderColumns &&
        draggingColumnKey &&
        dropTarget &&
        draggingColumnKey !== dropTarget &&
        effectiveTable?.columns?.length
      ) {
        const dataCols = [...effectiveTable!.columns];
        const fromI = dataCols.findIndex((c) => c.key === draggingColumnKey);
        const toI = dataCols.findIndex((c) => c.key === dropTarget);
        if (fromI >= 0 && toI >= 0 && fromI !== toI) {
          const [removed] = dataCols.splice(fromI, 1);
          dataCols.splice(toI, 0, removed);
          effectiveOnReorderColumns(dataCols.map((c) => c.key));
          didReorderRef.current = true;
        }
      } else if (draggingColumnKey && !dropTarget) {
        const dx = Math.abs(e.clientX - dragStartRef.current.x);
        const dy = Math.abs(e.clientY - dragStartRef.current.y);
        if (dx < 5 && dy < 5) setColumnMenuOpen(draggingColumnKey);
      }
      setDraggingColumnKey(null);
      setDropTargetColumnKey(null);
      setDragOverlayX(null);
      dropTargetColumnKeyRef.current = null;
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDragOverlayX(null);
    };
  }, [draggingColumnKey, effectiveTable?.columns, effectiveOnReorderColumns]);

  /** 从 MouseEvent 或 TouchEvent 获取 clientX/clientY，用于统一处理鼠标与触摸 */
  const getPointerCoords = useCallback((e: React.MouseEvent | React.TouchEvent): { clientX: number; clientY: number } | null => {
    if ("touches" in e && e.touches.length > 0) {
      return { clientX: e.touches[0]!.clientX, clientY: e.touches[0]!.clientY };
    }
    if ("clientX" in e) return { clientX: e.clientX, clientY: e.clientY };
    return null;
  }, []);

  const handleCanvasPointerDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-overlay]")) return;
      if (!rendererRef.current || !canvasRef.current) return;
      const coords = getPointerCoords(e);
      if (!coords) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = coords.clientX - rect.left;
      const y = coords.clientY - rect.top;

      // 只读模式下仍然允许拖拽列宽
      const resizeCol = rendererRef.current.getResizeHandleAt(x, y);
      if (resizeCol) {
        lastMouseDownWasResizeRef.current = true;
        handleResizeStart(
          {
            clientX: coords.clientX,
            preventDefault: () => e.preventDefault?.(),
            stopPropagation: () => e.stopPropagation?.(),
          },
          resizeCol
        );
        if ("touches" in e) e.preventDefault();
        return;
      }

      // 其它交互（拖拽表头排序）在只读模式下禁用
      if (readOnly) return;

      if (y < HEADER_HEIGHT && effectiveOnReorderColumns) {
        const headerCol = rendererRef.current.getHeaderColumnAt(x, y);
        if (headerCol && headerCol !== ADD_COLUMN_KEY && headerCol !== ID_COLUMN_KEY) {
          setDraggingColumnKey(headerCol);
          if (containerRef.current) {
            const rect2 = containerRef.current.getBoundingClientRect();
            setDragOverlayX(coords.clientX - rect2.left);
          }
          dragStartRef.current = { x: coords.clientX, y: coords.clientY };
          dropTargetColumnKeyRef.current = null;
          setDropTargetColumnKey(null);
        }
      }
    },
    [getPointerCoords, handleResizeStart, effectiveOnReorderColumns, readOnly]
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (readOnly) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-overlay]")) return;
      if (lastMouseDownWasResizeRef.current) {
        lastMouseDownWasResizeRef.current = false;
        return;
      }
      if (didReorderRef.current) {
        didReorderRef.current = false;
        return;
      }
      if (!rendererRef.current || !canvasRef.current || editingCell) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (y < HEADER_HEIGHT) {
        const headerCol = rendererRef.current.getHeaderColumnAt(x, y);
        if (headerCol) {
          if (headerCol === ADD_COLUMN_KEY) {
            onAddColumn?.();
            return;
          }
          setColumnMenuOpen((prev) => (prev === headerCol ? null : headerCol));
          return;
        }
      }
      const cell = rendererRef.current.getCellAt(x, y);
      if (cell && cell.colKey) {
        const row = filteredRows[cell.rowIndex];
        if (row) {
          const col = visibleColumns.find((c) => c.key === cell.colKey);
          if (col) {
            const initialValue = row.cells[cell.colKey] || "";
            setEditingCell({ rowId: row.id, columnKey: cell.colKey });
            setCellValue(initialValue);
            editingCellOriginalValueRef.current = initialValue;
            if (col.type === "multi_select") {
              setMultiSelectOpen({ rowId: row.id, columnKey: cell.colKey });
            } else if (col.type === "single_select") {
              setSingleSelectOpen(true);
            }
            const cellRect = rendererRef.current.getCellRect(cell.rowIndex, cell.colKey);
            if (cellRect) setCellEditorRect(cellRect);
          }
        }
      }
    },
    [filteredRows, visibleColumns, editingCell, onAddColumn]
  );

  /** 结束编辑：若传入 finalValue 则用其与原始值比较（避免 setState 未 flush 时用旧值）；否则用当前 cellValue */
  const handleCellBlur = useCallback(
    (finalValue?: string) => {
      if (editingCell) {
        const valueToUse = finalValue !== undefined ? finalValue : cellValue;
        const original = editingCellOriginalValueRef.current;
        const isModified = valueToUse !== original;
        if (isModified) {
          effectiveOnCellChange(editingCell.rowId, editingCell.columnKey, valueToUse);
        }
        setEditingCell(null);
        setCellEditorRect(null);
        setCellValue("");
        setSingleSelectOpen(false);
      }
    },
    [editingCell, cellValue, effectiveOnCellChange]
  );

  /** Canvas 右键：不在列/行内则无操作；列头右击等同列下拉；内容区右击显示行菜单（编辑/删除） */
  const handleCanvasContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return;
      e.preventDefault();
      setRowContextMenu(null);
      if (!rendererRef.current || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (y < HEADER_HEIGHT) {
        const headerCol = rendererRef.current.getHeaderColumnAt(x, y);
        if (headerCol && headerCol !== ID_COLUMN_KEY && headerCol !== ADD_COLUMN_KEY) {
          setColumnMenuOpen(headerCol);
        }
        return;
      }
      const cell = rendererRef.current.getCellAt(x, y);
      if (cell && cell.rowIndex >= 0 && cell.rowIndex < filteredRows.length) {
        const row = filteredRows[cell.rowIndex];
        if (row) setRowContextMenu({ row, x: e.clientX, y: e.clientY });
      }
    },
    [filteredRows]
  );

  useEffect(() => {
    if (!rowContextMenu) return;
    const close = () => setRowContextMenu(null);
    const onMouseDown = (e: MouseEvent) => {
      if (rowContextMenuRef.current && !rowContextMenuRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [rowContextMenu]);

  // 解析 Excel 并进入列映射或导入模式选择
  const handleParseExcel = useCallback(
    async (file: File) => {
      try {
        const { headers, data } = await parseExcelFile(file);
        setExcelHeaders(headers);
        setExcelData(data);
        const isNewTable = effectiveRows.length === 0 && effectiveTable?.columns.length === 0;
        if (isNewTable) {
          const existingKeys = new Set<string>();
          const mappings = headers.map((header: string) => {
            const headerStr = String(header).trim();
            const key = generateKeyFromLabel(headerStr, existingKeys);
            existingKeys.add(key);
            return { excelHeader: headerStr, key, label: headerStr, type: "text", defaultValue: "" };
          });
          setColumnMappings(mappings);
          setColumnMappingDialogOpen(true);
          setImportDialogOpen(false);
        } else {
          const excelKeys = headers.map((h: string) => {
            const headerStr = String(h).trim();
            for (const col of effectiveTable!.columns) {
              const nH = normalize(headerStr);
              const nL = normalize(col.label);
              const nK = normalize(col.key);
              if (headerStr === col.label || headerStr === col.key || nH === nL || nH === nK) return col.key;
            }
            return null;
          });
          const allMatched = excelKeys.every((k) => k !== null) && excelKeys.length === (effectiveTable?.columns?.length ?? 0);
          if (allMatched) {
            setImportModeDialogOpen(true);
            setImportDialogOpen(false);
          } else {
            setColumnMismatchDialogOpen(true);
            setImportDialogOpen(false);
          }
        }
      } catch (err) {
        const msg = err instanceof ExcelParseError ? err.message : err instanceof Error ? err.message : "解析 Excel 文件失败，请检查文件格式";
        setErrorMessage(msg.includes("xlsx") ? "请先安装 xlsx 库：pnpm add xlsx" : msg);
        setErrorDialogOpen(true);
      }
    },
    [effectiveTable, effectiveRows]
  );

  const executeImport = useCallback(
    (mappings: Array<{ excelHeader: string; key: string; label: string; type: string; defaultValue: string }>, mode: "append" | "replace") => {
      if (!excelData?.length) {
        setErrorMessage("没有找到可导入的数据。请检查Excel文件是否包含数据行。");
        setErrorDialogOpen(true);
        return;
      }
      const columnMap: Record<string, string> = {};
      mappings.forEach((m) => { columnMap[m.excelHeader] = m.key; });
      let newColumns: Array<{ key: string; label: string; type?: string; defaultValue?: string }> = [];
      if (mode === "replace") {
        newColumns = mappings.map((m) => ({ key: m.key, label: m.label, type: m.type || "text", defaultValue: m.defaultValue || "" }));
        onImportColumns?.(newColumns, "replace");
      } else {
        const existingKeys = new Set(effectiveTable?.columns.map((c) => c.key) ?? []);
        mappings.forEach((m) => {
          if (!existingKeys.has(m.key)) newColumns.push({ key: m.key, label: m.label, type: m.type || "text", defaultValue: m.defaultValue || "" });
        });
        if (newColumns.length) onImportColumns?.(newColumns, "append");
      }
      const maxRowId = mode === "append" && effectiveRows.length > 0 ? Math.max(...effectiveRows.map((r) => (r.row_id >= 0 ? r.row_id : -1)), -1) : -1;
      const importedRows: TableRowType[] = [];
      excelData.forEach((rowData: unknown[], index: number) => {
        if (!rowData || (Array.isArray(rowData) && rowData.every((c) => c == null || String(c).trim() === ""))) return;
        const cells: Record<string, string> = {};
        excelHeaders.forEach((header, hi) => {
          const columnKey = columnMap[header];
          if (columnKey && rowData && rowData[hi] != null) cells[columnKey] = String(rowData[hi] ?? "").trim();
          else if (columnKey) cells[columnKey] = "";
        });
        const hasData = mode === "replace" || Object.keys(cells).length > 0;
        if (hasData) {
          importedRows.push({
            id: `temp-import-${Date.now()}-${index}`,
            table_id: effectiveTable!.id,
            row_id: mode === "append" ? maxRowId + importedRows.length + 1 : importedRows.length,
            cells,
            row_data: undefined,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      });
      if (importedRows.length > 0) {
        onImportRows?.(importedRows, mode);
        setImportDialogOpen(false);
        setColumnMappingDialogOpen(false);
        setImportModeDialogOpen(false);
        setColumnMismatchDialogOpen(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        const modeInfo = mode === "replace" ? "（已替换现有数据和列定义）" : "（已追加到现有数据）";
        const newColumnsInfo = mode === "replace"
          ? `\n\n已替换为 ${mappings.length} 个列：${mappings.map((m) => m.label).join(", ")}`
          : newColumns.length > 0 ? `\n\n已自动创建 ${newColumns.length} 个新列：${newColumns.map((c) => c.label).join(", ")}` : "";
        setSuccessMessage(`成功导入 ${importedRows.length} 行数据，共 ${excelHeaders.length} 个列。${modeInfo}${newColumnsInfo}`);
        setSuccessDialogOpen(true);
      } else {
        setErrorMessage("没有找到可导入的数据。请检查Excel文件是否包含数据行。");
        setErrorDialogOpen(true);
      }
    },
    [excelData, excelHeaders, effectiveTable, effectiveRows, onImportRows, onImportColumns]
  );

  const handleFileImport = useCallback((file: File) => handleParseExcel(file), [handleParseExcel]);

  useEffect(() => {
    if (!resizingColumn) return;
    const getClientX = (e: MouseEvent | TouchEvent): number => {
      if ("touches" in e && e.touches.length > 0) return e.touches[0]!.clientX;
      if ("changedTouches" in e && e.changedTouches.length > 0) return e.changedTouches[0]!.clientX;
      return (e as MouseEvent).clientX;
    };
    const handleResizeMove = (e: MouseEvent | TouchEvent) => {
      const clientX = getClientX(e);
      const diff = clientX - resizeStartX;
      const newW = Math.max(50, resizeStartWidth + diff);
      setColumnWidthsOrModel(resizingColumn, newW);
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setResizeLineX(clientX - rect.left);
      }
      if ("touches" in e) e.preventDefault();
    };
    const handleResizeEnd = () => {
      setResizingColumn(null);
      resizingColumnRef.current = null;
      setResizeLineX(null);
    };
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
    document.addEventListener("touchmove", handleResizeMove, { passive: false });
    document.addEventListener("touchend", handleResizeEnd);
    document.addEventListener("touchcancel", handleResizeEnd);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
      document.removeEventListener("touchmove", handleResizeMove);
      document.removeEventListener("touchend", handleResizeEnd);
      document.removeEventListener("touchcancel", handleResizeEnd);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setResizeLineX(null);
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth]);

  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  /** 有聚焦单元格时，滚动后根据当前 scroll 重算编辑器位置，使编辑器跟随瓦片 */
  useLayoutEffect(() => {
    if (!editingCell || !rendererRef.current) return;
    const rowIndex = filteredRows.findIndex((r) => r.id === editingCell.rowId);
    if (rowIndex < 0) return;
    const rect = rendererRef.current.getCellRect(rowIndex, editingCell.columnKey);
    if (rect) setCellEditorRect(rect);
  }, [editingCell, scrollX, scrollY, filteredRows, columnWidths]);

  useEffect(() => {
    const viewportEl = canvasOverlayRef.current ?? containerRef.current;
    if (!viewportEl) return;
    const update = () => {
      setViewportSize({ width: viewportEl.clientWidth, height: viewportEl.clientHeight });
      if (rendererRef.current) {
        rendererRef.current.resize();
        doRender();
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(viewportEl);
    return () => ro.disconnect();
  }, [doRender]);

  const bodyViewportHeight = Math.max(0, viewportSize.height - HEADER_HEIGHT);
  const showVerticalScrollbar = totalBodyHeight > bodyViewportHeight;
  const showHorizontalScrollbar = totalWidth > viewportSize.width;

  // 纵向用原生滚动条；横向隐藏原生条，用自定义条以便「有横向滚动距离时始终显示」
  const renderView = useCallback(
    (props: React.HTMLAttributes<HTMLDivElement>) => (
      <div
        {...props}
        style={{
          ...props.style,
          pointerEvents: "none",
          overflowX: "hidden",
          overflowY: props.style?.overflowY ?? "scroll",
        }}
      />
    ),
    []
  );

  // 纵向：强制显示轨道/拇指（库在 getScrollbarWidth()===0 时会传 display:none，必须显式覆盖为 block）
  const renderTrackVertical = useCallback(
    (props: React.HTMLAttributes<HTMLDivElement>) => (
      <div
        {...props}
        className={cn(props.className, "canvas-table-vertical-track")}
        data-show-vertical-scrollbar={showVerticalScrollbar ? "true" : undefined}
        style={{
          ...props.style,
          width: SCROLLBAR_SIZE,
          display: showVerticalScrollbar ? "block" : "none",
        }}
      />
    ),
    [showVerticalScrollbar]
  );

  const renderThumbVertical = useCallback(
    (props: React.HTMLAttributes<HTMLDivElement>) => (
      <div
        {...props}
        style={{
          ...props.style,
          display: showVerticalScrollbar ? "block" : "none",
          width: SCROLLBAR_SIZE,
          borderRadius: 6,
          backgroundColor: "hsl(var(--muted-foreground) / 0.3)",
        }}
      />
    ),
    [showVerticalScrollbar]
  );

  // 横向：隐藏库内建的轨道/拇指，改用下方独立一层自绘横向滚动条（避免被遮挡、事件可靠）
  const renderTrackHorizontal = useCallback(
    (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} style={{ ...props.style, display: "none" }} />,
    []
  );

  const renderThumbHorizontal = useCallback(
    (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} style={{ ...props.style, display: "none" }} />,
    []
  );

  // 自绘横向滚动条：轨道宽度、拇指宽度与位置（用于独立层）
  const horizontalTrackWidth = viewportSize.width;
  const horizontalMaxScroll = Math.max(0, totalWidth - viewportSize.width);
  const horizontalThumbWidth =
    horizontalMaxScroll <= 0 ? 0 : Math.max(24, (viewportSize.width / totalWidth) * horizontalTrackWidth);
  const horizontalThumbLeft =
    horizontalMaxScroll <= 0 || horizontalThumbWidth >= horizontalTrackWidth
      ? 0
      : (scrollX / horizontalMaxScroll) * (horizontalTrackWidth - horizontalThumbWidth);

  // 自绘纵向滚动条：轨道高度、拇指高度与位置（独立层，保证在 getScrollbarWidth()===0 时也可用）
  const verticalMaxScroll = Math.max(0, totalBodyHeight - bodyViewportHeight);
  const verticalTrackHeight = bodyViewportHeight;
  const verticalThumbHeight =
    verticalMaxScroll <= 0 ? 0 : Math.max(24, (bodyViewportHeight / totalBodyHeight) * verticalTrackHeight);
  const verticalThumbTop =
    verticalMaxScroll <= 0 || verticalThumbHeight >= verticalTrackHeight
      ? 0
      : (scrollY / verticalMaxScroll) * (verticalTrackHeight - verticalThumbHeight);

  const handleVerticalTrackMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault?.();
    const sb = scrollbarsRef.current;
    const track = e.currentTarget;
    if (!sb) return;
    const scrollHeight = sb.getScrollHeight();
    const clientHeight = sb.getClientHeight();
    if (scrollHeight <= clientHeight) return;
    const rect = track.getBoundingClientRect();
    const trackHeight = rect.height;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
    const maxScroll = scrollHeight - clientHeight;
    const range = trackHeight - thumbHeight;
    if (range <= 0) return;
    const clickOffset = e.clientY - rect.top;
    const thumbCenter = clickOffset - thumbHeight / 2;
    const thumbTop = Math.max(0, Math.min(range, thumbCenter));
    const newTop = (thumbTop / range) * maxScroll;
    sb.scrollTop(newTop);
  }, []);

  const getClientY = (e: MouseEvent | TouchEvent): number => {
    if ("touches" in e && e.touches.length > 0) return e.touches[0]!.clientY;
    if ("changedTouches" in e && e.changedTouches.length > 0) return e.changedTouches[0]!.clientY;
    return (e as MouseEvent).clientY;
  };
  const getClientX = (e: MouseEvent | TouchEvent): number => {
    if ("touches" in e && e.touches.length > 0) return e.touches[0]!.clientX;
    if ("changedTouches" in e && e.changedTouches.length > 0) return e.changedTouches[0]!.clientX;
    return (e as MouseEvent).clientX;
  };

  const handleVerticalThumbMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault?.();
    e.stopPropagation?.();
    const sb = scrollbarsRef.current;
    const thumb = e.currentTarget;
    const track = thumb.parentElement;
    if (!sb || !track) return;
    const scrollHeight = sb.getScrollHeight();
    const clientHeight = sb.getClientHeight();
    if (scrollHeight <= clientHeight) return;
    const thumbRect = thumb.getBoundingClientRect();
    const prevPageY = e.clientY - thumbRect.top;
    const thumbHeight = Math.max(24, thumbRect.height);
    verticalDragRef.current = { thumbHeight, prevPageY };

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      const tr = track.getBoundingClientRect();
      const trackHeight = tr.height;
      const range = trackHeight - thumbHeight;
      if (range <= 0) return;
      const clientY = getClientY(moveEvent);
      const offset = clientY - tr.top - prevPageY;
      const maxScroll = scrollHeight - clientHeight;
      const newTop = Math.max(0, Math.min(maxScroll, (offset / range) * maxScroll));
      sb.scrollTop(newTop);
      if ("touches" in moveEvent) moveEvent.preventDefault();
    };
    const onEnd = () => {
      verticalDragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
  }, []);

  const handleVerticalTrackTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) return;
    const syntheticEvent = { clientY: e.touches[0]!.clientY, currentTarget: e.currentTarget } as unknown as React.MouseEvent<HTMLDivElement>;
    handleVerticalTrackMouseDown(syntheticEvent);
  }, [handleVerticalTrackMouseDown]);

  const handleVerticalThumbTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const syntheticEvent = { clientY: e.touches[0]!.clientY, preventDefault: () => {}, stopPropagation: () => {}, currentTarget: e.currentTarget } as unknown as React.MouseEvent<HTMLDivElement>;
    handleVerticalThumbMouseDown(syntheticEvent);
  }, [handleVerticalThumbMouseDown]);

  const handleClearEditing = useCallback(() => {
    setEditingCell(null);
    setCellEditorRect(null);
    setCellValue("");
  }, []);

  /** 表头菜单中切换「固定在左侧」 */
  const handleTogglePinLeft = useCallback(
    (columnKey: string, pinned: boolean) => {
      setPinnedLeftColumnsState((prev) => {
        let next: string[];
        if (pinned) {
          if (prev.includes(columnKey)) return prev;
          next = [...prev, columnKey];
        } else {
          next = prev.filter((k) => k !== columnKey);
        }
        onPinnedLeftColumnsChange?.(next);
        return next;
      });
    },
    [onPinnedLeftColumnsChange]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  const filterPopoverContent = (
    <TableCanvasFilterPopover
      filterGroups={filterGroups}
      setFilterGroups={setFilterGroups}
      columns={visibleColumns}
      filteredCount={filteredRows.length}
      totalCount={effectiveRows.length}
    />
  );

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0">
      {!readOnly && (
        <TableCanvasToolbar
          canUndo={effectiveCanUndo}
          canRedo={effectiveCanRedo}
          onUndo={effectiveOnUndo}
          onRedo={effectiveOnRedo}
          showUndoRedo={(model ?? onUndo) != null}
          onAddRow={onAddRow}
          filterGroups={filterGroups}
          showFilterPanel={showFilterPanel}
          onFilterPanelChange={setShowFilterPanel}
          filterPopoverContent={filterPopoverContent}
          conditionMenuOpen={conditionMenuOpen}
          onConditionMenuOpenChange={setConditionMenuOpen}
          onEditByCondition={onEditByCondition}
          onDeleteByCondition={onDeleteByCondition}
          onQueryByCondition={onQueryByCondition}
          onImportClick={onImportRows ? () => setImportDialogOpen(true) : undefined}
          columnVisibilityPopoverContent={columnVisibilityPopoverContent}
          columnVisibilityHiddenCount={columnVisibilityHiddenCount}
          toolbarExtraLeftOfSave={toolbarExtraLeftOfSave}
          onSave={onSave}
          saving={saving}
          hasUnsavedChanges={hasUnsavedChanges}
        />
      )}

      <div ref={containerRef} className="flex-1 min-h-0 min-w-0 relative overflow-hidden">
        {/* 强制显示自定义滚动条轨道（库在 scrollbarWidth===0 时会设 display:none，用 !important 覆盖） */}
        <style dangerouslySetInnerHTML={{ __html: `
          [data-show-vertical-scrollbar="true"].canvas-table-vertical-track { display: block !important; }
          [data-show-horizontal-scrollbar="true"].canvas-table-horizontal-track { display: block !important; }
        `}} />
        {/* 表头占位，使 Scrollbars 从 HEADER_HEIGHT 起，同时绘制底部边框 */}
        <div
          className="border-b border-border bg-background"
          style={{ height: HEADER_HEIGHT, flexShrink: 0 }}
          aria-hidden
        />
        {!hideIdColumn && (
          <TableCanvasIdColumn
            idColumnWidth={effectiveIdColumnWidth}
            totalBodyHeight={totalBodyHeight}
            scrollY={scrollY}
            rows={filteredRows}
            showHorizontalScrollbar={showHorizontalScrollbar}
          />
        )}
        {/* 单 Scrollbars：底部有横向条时留出高度，避免库内 Y 轴轨道伸入底部 X 轴条内 */}
        <div
          className="absolute inset-0 z-20"
          style={{
            right: showVerticalScrollbar ? SCROLLBAR_SIZE : 0,
            bottom: showHorizontalScrollbar ? SCROLLBAR_SIZE : 0,
          }}
          onWheel={(e) => {
            if (resizingColumnRef.current) {
              e.preventDefault();
              return;
            }
            const sb = scrollbarsRef.current;
            if (!sb) return;
            let handled = false;
            if (e.deltaY !== 0) {
              const top = sb.getScrollTop();
              const maxTop = Math.max(0, sb.getScrollHeight() - sb.getClientHeight());
              sb.scrollTop(Math.max(0, Math.min(maxTop, top + e.deltaY)));
              handled = true;
            }
            if (e.deltaX !== 0) {
              const left = sb.getScrollLeft();
              const maxLeft = Math.max(0, sb.getScrollWidth() - sb.getClientWidth());
              sb.scrollLeft(Math.max(0, Math.min(maxLeft, left + e.deltaX)));
              handled = true;
            }
            if (handled) e.preventDefault();
          }}
        >
          <Scrollbars
            ref={scrollbarsRef}
            style={{
              position: "absolute",
              top: HEADER_HEIGHT,
              left: 0,
              right: 0,
              bottom: 0,
              width: "auto",
              height: "auto",
              minHeight: 100,
            }}
            onScrollFrame={handleScrollFrame}
            hideTracksWhenNotNeeded={false}
            renderView={renderView}
            renderTrackVertical={renderTrackVertical}
            renderThumbVertical={renderThumbVertical}
            renderTrackHorizontal={renderTrackHorizontal}
            renderThumbHorizontal={renderThumbHorizontal}
          >
            <div style={{ width: totalWidth, height: totalBodyHeight, minHeight: totalBodyHeight }} aria-hidden />
          </Scrollbars>
        </div>

        <TableCanvasColumnDragOverlays
          resizeLineX={resizeLineX}
          dropTargetColumnKey={dropTargetColumnKey}
          draggingColumnKey={draggingColumnKey}
          dragOverlayX={dragOverlayX}
          columns={visibleColumns}
          columnWidths={columnWidths}
          idColumnWidth={effectiveIdColumnWidth}
          scrollX={scrollX}
          pinnedColumnKeys={pinnedLeftColumnsState.length ? pinnedLeftColumnsState : undefined}
        />

        {showVerticalScrollbar && verticalMaxScroll > 0 && showScrollbars && (
          <TableCanvasVerticalScrollbar
            thumbHeight={verticalThumbHeight}
            thumbTop={verticalThumbTop}
            scrollY={scrollY}
            maxScroll={verticalMaxScroll}
            onTrackMouseDown={handleVerticalTrackMouseDown}
            onThumbMouseDown={handleVerticalThumbMouseDown}
            onTrackTouchStart={handleVerticalTrackTouchStart}
            onThumbTouchStart={handleVerticalThumbTouchStart}
            onMouseEnter={onScrollbarMouseEnter}
            onMouseLeave={onScrollbarMouseLeave}
            topOffset={HEADER_HEIGHT}
            bottomOffset={showHorizontalScrollbar ? SCROLLBAR_SIZE : 0}
          />
        )}

        {showHorizontalScrollbar && horizontalMaxScroll > 0 && showScrollbars && (
          <TableCanvasHorizontalScrollbar
            thumbWidth={horizontalThumbWidth}
            thumbLeft={horizontalThumbLeft}
            scrollX={scrollX}
            maxScroll={horizontalMaxScroll}
            onTrackMouseDown={handleHorizontalTrackMouseDown}
            onThumbMouseDown={handleHorizontalThumbMouseDown}
            onTrackTouchStart={handleHorizontalTrackTouchStart}
            onThumbTouchStart={handleHorizontalThumbTouchStart}
            onMouseEnter={onScrollbarMouseEnter}
            onMouseLeave={onScrollbarMouseLeave}
            rightOffset={showVerticalScrollbar ? SCROLLBAR_SIZE : 0}
          />
        )}

        {/* 单 Canvas：z-30 置于 Scrollbars(z-20) 之上，表头/内容区点击与列宽拖拽由 canvas 接收；父层不用 pointer-events-none 否则 canvas 收不到 hover */}
        <div
          ref={canvasOverlayRef}
          className="absolute top-0 left-0 bottom-0 z-30"
          style={{
            right: showVerticalScrollbar ? SCROLLBAR_SIZE : 0,
            bottom: showHorizontalScrollbar ? SCROLLBAR_SIZE : 0,
          }}
        >
          <canvas
            ref={canvasRef}
            className="block w-full h-full"
            onMouseDown={handleCanvasPointerDown}
            onTouchStart={handleCanvasPointerDown}
            onClick={handleCanvasClick}
            onContextMenu={handleCanvasContextMenu}
            onMouseMove={(e) => {
              if (!rendererRef.current || !canvasRef.current) return;
              if ((e.target as HTMLElement).closest("[data-overlay]")) return;
              const rect = canvasRef.current.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              if (y < HEADER_HEIGHT) {
                const headerCol = rendererRef.current.getHeaderColumnAt(x, y);
                if (headerCol && headerCol !== ADD_COLUMN_KEY && headerCol !== ID_COLUMN_KEY) {
                  setHoveredColumnKey(headerCol);
                } else {
                  setHoveredColumnKey(null);
                }
                if (rendererRef.current.getResizeHandleAt(x, y)) {
                  setCanvasCursor("col-resize");
                } else if (headerCol === ADD_COLUMN_KEY) {
                  setCanvasCursor("pointer");
                } else if (effectiveOnReorderColumns && headerCol && headerCol !== ADD_COLUMN_KEY && headerCol !== ID_COLUMN_KEY) {
                  setCanvasCursor("grab");
                } else {
                  setCanvasCursor("default");
                }
              } else {
                setHoveredColumnKey(null);
                setCanvasCursor("default");
              }
            }}
            onMouseEnter={() => {
              if (hoverLeaveTimeoutRef.current) {
                clearTimeout(hoverLeaveTimeoutRef.current);
                hoverLeaveTimeoutRef.current = null;
              }
              setIsHoveringTableArea(true);
            }}
            onMouseLeave={() => {
              setCanvasCursor("default");
              hoverLeaveTimeoutRef.current = setTimeout(() => setIsHoveringTableArea(false), 150);
              if (hoveredColumnClearTimeoutRef.current) clearTimeout(hoveredColumnClearTimeoutRef.current);
              hoveredColumnClearTimeoutRef.current = setTimeout(() => setHoveredColumnKey(null), 150);
            }}
            style={{
              pointerEvents: "auto",
              cursor: resizingColumn ? "col-resize" : draggingColumnKey ? "grabbing" : canvasCursor,
            }}
          />
        </div>

        {/* DOM 覆盖层：z-35 高于 canvas；表头悬停感应层单独用 pointer-events-auto 保证能收到 hover */}
        <div
          className="absolute top-0 left-0 bottom-0 z-[35]"
          style={{ right: showVerticalScrollbar ? SCROLLBAR_SIZE : 0, bottom: showHorizontalScrollbar ? SCROLLBAR_SIZE : 0, pointerEvents: "none" }}
        >
          {/* 表头悬停感应：覆盖表头区域，接收 mousemove 以显示下拉箭头并设置正确光标（col-resize/grab）；mousedown/click 转发给 canvas 逻辑；右键等同列下拉 */}
          <div
            className="absolute top-0 left-0 right-0 pointer-events-auto z-10"
            style={{
              height: HEADER_HEIGHT,
              marginRight: showVerticalScrollbar ? SCROLLBAR_SIZE : 0,
              cursor: resizingColumn ? "col-resize" : draggingColumnKey ? "grabbing" : canvasCursor,
            }}
            onContextMenu={handleCanvasContextMenu}
            onMouseMove={(e) => {
              if (!rendererRef.current || !canvasRef.current || !containerRef.current) return;
              const rect = containerRef.current.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              const resizeCol = rendererRef.current.getResizeHandleAt(x, y);
              if (resizeCol) {
                setCanvasCursor("col-resize");
                setHoveredColumnKey(null);
                return;
              }
              const headerCol = rendererRef.current.getHeaderColumnAt(x, y);
              if (headerCol && headerCol !== ADD_COLUMN_KEY && headerCol !== ID_COLUMN_KEY) {
                setHoveredColumnKey(headerCol);
                setCanvasCursor(effectiveOnReorderColumns ? "grab" : "default");
              } else {
                setHoveredColumnKey(null);
                setCanvasCursor(headerCol === ADD_COLUMN_KEY ? "pointer" : "default");
              }
            }}
            onMouseLeave={(e) => {
              const related = e.relatedTarget as HTMLElement | null;
              if (related?.closest?.("[data-overlay]")) return;
              setHoveredColumnKey(null);
              setCanvasCursor("default");
            }}
            onMouseDown={(e) => {
              if (!(e.target as HTMLElement).closest("[data-overlay]")) handleCanvasPointerDown(e as unknown as React.MouseEvent<HTMLCanvasElement>);
            }}
            onTouchStart={(e) => {
              if (!(e.target as HTMLElement).closest("[data-overlay]")) handleCanvasPointerDown(e as unknown as React.TouchEvent<HTMLCanvasElement>);
            }}
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest("[data-overlay]")) handleCanvasClick(e as unknown as React.MouseEvent<HTMLCanvasElement>);
            }}
          />

          {/* 固定在左侧的列（DOM 覆盖层）：按表序排列，随纵向滚动，不随横向滚动 */}
          {visibleColumns.length > 0 && pinnedColsOrdered.length > 0 && (() => {
            const idWidth = columnWidths[ID_COLUMN_KEY] ?? DEFAULT_ID_COLUMN_WIDTH;
            const pinnedCols = pinnedColsOrdered;
            const pinnedWidths = pinnedCols.map((col) => columnWidths[col.key] ?? DEFAULT_COLUMN_WIDTH);
            const colTypes: Record<string, string | undefined> = {};
            visibleColumns.forEach((c) => {
              colTypes[c.key] = c.type;
            });

            return (
              <>
                {/* 表头固定列 */}
                <div
                  className="absolute top-0 z-20 flex"
                  style={{
                    left: idWidth,
                    width: totalPinnedWidth,
                    height: HEADER_HEIGHT,
                    pointerEvents: "none",
                  }}
                >
                  {pinnedCols.map((col, index) => {
                    const w = pinnedWidths[index];

                    let pathD: string;
                    switch (col.type) {
                      case "number":
                        pathD =
                          "M20 9H42 M20 19H42 M20 29H42 M20 39H42 M6 29H12V32L6 38V39H12 M7 11L9 9V19M9 19H7M9 19H11";
                        break;
                      case "date":
                        pathD =
                          "M5 19H43V40C43 41.1046 42.1046 42 41 42H7C5.89543 42 5 41.1046 5 40V19Z M5 9C5 7.89543 5.89543 7 7 7H41C42.1046 7 43 7.89543 43 9V19H5V9Z M16 4V12 M32 4V12 M28 34H34 M14 34H20 M28 26H34 M14 26H20";
                        break;
                      case "single_select":
                        pathD =
                          "M44 24A20 20 0 0 1 24 44A20 20 0 0 1 4 24A20 20 0 0 1 24 4A20 20 0 0 1 44 24 M32 24A8 8 0 0 1 24 32A8 8 0 0 1 16 24A8 8 0 0 1 24 16A8 8 0 0 1 32 24";
                        break;
                      case "multi_select":
                        pathD =
                          "M20 24H44 M20 38H44 M20 10H44 M4 34H12V42H4V34Z M4 20H12V28H4V20Z M4 6H12V14H4V6Z";
                        break;
                      case "text":
                      default:
                        pathD =
                          "M4 42L8.94118 30M32 42L27.0588 30M27.0588 30L25 25L18 8L11 25L8.94118 30M27.0588 30H8.94118 M28 10L44 10 M32 20L44 20 M36 30L44 30 M40 40H44";
                        break;
                    }

                    return (
                      <div
                        key={col.key}
                        className="relative flex items-center px-2 border-b border-r border-border bg-background text-sm text-foreground"
                        style={{ width: w, minWidth: w, maxWidth: w }}
                      >
                        {/* 左上角固定列三角标识 */}
                        <span
                          className="absolute left-0 top-0 h-[6px] w-[6px] bg-muted-foreground/50 [clip-path:polygon(0_0,100%_0,0_100%)]"
                          aria-hidden="true"
                        />
                        <span
                          className="inline-flex shrink-0 items-center justify-center"
                          style={{ width: HEADER_ICON_WIDTH, minWidth: HEADER_ICON_WIDTH }}
                          aria-hidden="true"
                        >
                          <svg
                            viewBox="0 0 48 48"
                            className="h-4 w-4 text-foreground"
                            role="presentation"
                          >
                            <path
                              d={pathD}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeLinejoin="miter"
                            />
                          </svg>
                        </span>
                        <span className="min-w-0 truncate" title={col.label}>
                          {col.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 内容区固定列 */}
                <div
                  className="absolute z-20 overflow-hidden"
                  style={{
                    top: HEADER_HEIGHT,
                    left: idWidth,
                    bottom: showHorizontalScrollbar ? SCROLLBAR_SIZE : 0,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      width: totalPinnedWidth,
                      height: totalBodyHeight,
                      transform: `translateY(-${scrollY}px)`,
                    }}
                  >
                    {filteredRows.map((row) => (
                      <div
                        key={row.id}
                        className="flex"
                        style={{ height: CELL_HEIGHT }}
                      >
                        {pinnedCols.map((col, index) => {
                          const w = pinnedWidths[index];
                          const raw = row.cells[col.key] ?? "";
                          const display = formatTableCellValue(raw, colTypes[col.key]);
                          return (
                            <div
                              key={col.key}
                              className="flex items-center px-2 border-b border-r border-border bg-background text-sm text-foreground"
                              style={{ width: w, minWidth: w, maxWidth: w }}
                            >
                              <span className="truncate" title={display}>
                                {display}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}

          {editingCell && cellEditorRect && (() => {
            const col = visibleColumns.find((c) => c.key === editingCell.columnKey);
            return col ? (
              <div
                data-overlay
                className="absolute border-2 border-primary bg-background z-50 shadow-lg pointer-events-auto"
                style={{
                  left: cellEditorRect.x,
                  top: cellEditorRect.y,
                  width: cellEditorRect.width,
                  minHeight: cellEditorRect.height,
                }}
              >
                <TableCanvasCellEditor
                  col={col}
                  cellValue={cellValue}
                  setCellValue={setCellValue}
                  onBlur={handleCellBlur}
                  onClearEditing={handleClearEditing}
                  singleSelectOpen={singleSelectOpen}
                  setSingleSelectOpen={setSingleSelectOpen}
                  multiSelectOpen={multiSelectOpen}
                  setMultiSelectOpen={setMultiSelectOpen}
                  editingCell={editingCell}
                  originalValueRef={editingCellOriginalValueRef}
                  onCellChange={effectiveOnCellChange}
                  multiSelectTriggerRef={multiSelectTriggerRef}
                />
              </div>
            ) : null;
          })()}

          {!readOnly && (
            <TableCanvasColumnHeaderOverlay
              hoveredColumnKey={hoveredColumnKey}
              columnMenuOpen={columnMenuOpen}
              setColumnMenuOpen={setColumnMenuOpen}
              setHoveredColumnKey={setHoveredColumnKey}
              hoveredColumnClearTimeoutRef={hoveredColumnClearTimeoutRef}
              columns={visibleColumns}
              columnWidths={columnWidths}
              idColumnWidth={effectiveIdColumnWidth}
              scrollX={scrollX}
              onEditColumn={onEditColumn}
              onInsertColumnLeft={onInsertColumnLeft}
              onInsertColumnRight={onInsertColumnRight}
              onCopyColumn={onCopyColumn}
              onRequestDelete={(column) => {
                setColumnToDelete(column);
                setDeleteColumnDialogOpen(true);
              }}
            pinnedColumnKeys={pinnedLeftColumnsState}
            pinnedColsOrdered={pinnedColsOrdered}
            onTogglePin={handleTogglePinLeft}
          />
          )}
        </div>
      </div>

      {!readOnly && rowContextMenu && (
        <TableCanvasRowContextMenu
          row={rowContextMenu.row}
          x={rowContextMenu.x}
          y={rowContextMenu.y}
          menuRef={rowContextMenuRef}
          onEdit={onEditRow}
          onDelete={onDeleteRow}
          onClose={() => setRowContextMenu(null)}
        />
      )}

      {!readOnly && (
        <TableCanvasDeleteColumnDialog
          open={deleteColumnDialogOpen}
          onOpenChange={setDeleteColumnDialogOpen}
          columnToDelete={columnToDelete}
          onConfirm={onDeleteColumn}
          onCancel={() => { setColumnToDelete(null); }}
        />
      )}

      {onImportRows && (
        <TableCanvasImportDialogs
          importDialogOpen={importDialogOpen}
          setImportDialogOpen={setImportDialogOpen}
          columnMappingDialogOpen={columnMappingDialogOpen}
          setColumnMappingDialogOpen={setColumnMappingDialogOpen}
          importModeDialogOpen={importModeDialogOpen}
          setImportModeDialogOpen={setImportModeDialogOpen}
          columnMismatchDialogOpen={columnMismatchDialogOpen}
          setColumnMismatchDialogOpen={setColumnMismatchDialogOpen}
          errorDialogOpen={errorDialogOpen}
          setErrorDialogOpen={setErrorDialogOpen}
          successDialogOpen={successDialogOpen}
          setSuccessDialogOpen={setSuccessDialogOpen}
          errorMessage={errorMessage}
          successMessage={successMessage}
          importMode={importMode}
          setImportMode={setImportMode}
          excelHeaders={excelHeaders}
          setExcelHeaders={setExcelHeaders}
          excelData={excelData}
          setExcelData={setExcelData}
          columnMappings={columnMappings}
          setColumnMappings={setColumnMappings}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
          setErrorMessage={setErrorMessage}
          setSuccessMessage={setSuccessMessage}
          tableColumns={effectiveTable?.columns}
          fileInputRef={fileInputRef}
          onFileImport={handleFileImport}
          onExecuteImport={executeImport}
          onConfirmImportMode={() => {
            const mappings: ImportColumnMapping[] = excelHeaders.map((header) => {
              const headerStr = String(header).trim();
              const col = effectiveTable?.columns.find(
                (c) =>
                  headerStr === c.label ||
                  headerStr === c.key ||
                  normalize(headerStr) === normalize(c.label) ||
                  normalize(headerStr) === normalize(c.key)
              );
              return {
                excelHeader: headerStr,
                key: col?.key ?? headerStr,
                label: col?.label ?? headerStr,
                type: col?.type ?? "text",
                defaultValue: (col?.options as { defaultValue?: string } | undefined)?.defaultValue ?? "",
              };
            });
            executeImport(mappings, importMode);
          }}
          onConfirmColumnMismatchReplace={(headers) => {
            const existingKeys = new Set(effectiveTable?.columns.map((c) => c.key) ?? []);
            const mappings: ImportColumnMapping[] = headers.map((header) => {
              const headerStr = String(header).trim();
              const key = generateKeyFromLabel(headerStr, existingKeys);
              existingKeys.add(key);
              return { excelHeader: headerStr, key, label: headerStr, type: "text", defaultValue: "" };
            });
            setColumnMappings(mappings);
            setImportMode("replace");
            setColumnMismatchDialogOpen(false);
            setColumnMappingDialogOpen(true);
          }}
        />
      )}
    </div>
  );
}
