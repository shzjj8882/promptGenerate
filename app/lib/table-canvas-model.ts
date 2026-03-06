/**
 * 多维表格画布模型 - 纯 JS/TS 层，与 React、DOM、业务解耦
 *
 * 职责：
 * - Canvas 配置（cellHeight、headerHeight、idColumnKey、列宽等）
 * - 表格展示配置（showScrollbar、headerParticipatesScroll）
 * - 数据（table 元信息、rows、columns）
 * - 用户操作历史（撤销/重做/回滚）
 * - 对外回调：onRowChange、onColumnChange、onChange、onHistoryChange
 *
 * 使用方式：
 * 1. 业务层创建 model = new TableCanvasModel({ callbacks: { onRowChange, onColumnChange, onHistoryChange } })
 * 2. model.setData(table, rows) 初始化
 * 3. <TableCanvasView model={model} onAddRow={...} onSave={...} /> 仅传 model 时数据与历史由 model 驱动
 * 4. 组件内用户操作（单元格编辑、列宽、排序）会调用 model 方法，model 通知回调供业务同步 API
 */

import type {
  MultiDimensionTable,
  TableRow,
  TableColumn,
} from "@/lib/api/multi-dimension-tables";

// --------------- Canvas 配置 ---------------
export interface TableCanvasConfig {
  cellHeight?: number;
  headerHeight?: number;
  idColumnKey?: string;
  defaultColumnWidth?: number;
  idColumnWidth?: number;
}

const DEFAULT_CANVAS_CONFIG: Required<TableCanvasConfig> = {
  cellHeight: 40,
  headerHeight: 40,
  idColumnKey: "__id__",
  defaultColumnWidth: 150,
  idColumnWidth: 120,
};

// --------------- 表格画布视图配置 ---------------
export interface TableCanvasViewConfig {
  /** 是否显示滚动条 */
  showScrollbar?: boolean;
  /** 表头是否参与滚动（false = 表头吸顶） */
  headerParticipatesScroll?: boolean;
}

const DEFAULT_VIEW_CONFIG: Required<TableCanvasViewConfig> = {
  showScrollbar: true,
  headerParticipatesScroll: false,
};

// --------------- 历史步骤 ---------------
export type HistoryStepType =
  | "initial"
  | "update"
  | "add"
  | "delete"
  | "import"
  | "reorder";

export interface HistoryStep {
  rows: TableRow[];
  columns: TableColumn[];
  stepLabel?: string;
  stepType?: HistoryStepType;
  stepTitle?: string;
  stepDescription?: string;
  timestamp?: number;
}

// --------------- 模型对外回调 ---------------
export interface TableModelCallbacks {
  /** 行数据变化（增删改、导入等） */
  onRowChange?: (rows: TableRow[]) => void;
  /** 列定义变化（增删改、排序等） */
  onColumnChange?: (columns: TableColumn[]) => void;
  /** 任意数据变化，同时带出行与列 */
  onChange?: (payload: { rows: TableRow[]; columns: TableColumn[] }) => void;
  /** 历史变化（撤销/重做/回滚/新记录） */
  onHistoryChange?: (payload: {
    history: HistoryStep[];
    index: number;
    canUndo: boolean;
    canRedo: boolean;
  }) => void;
}

// --------------- 对外快照（供 React 订阅渲染） ---------------
export interface TableModelSnapshot {
  table: MultiDimensionTable | null;
  rows: TableRow[];
  columns: TableColumn[];
  columnWidths: Record<string, number>;
  history: HistoryStep[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  canvasConfig: Required<TableCanvasConfig>;
  viewConfig: Required<TableCanvasViewConfig>;
  /** 是否已初始化历史（有初始状态后才记录后续操作） */
  historyInitialized: boolean;
}

function deepCloneRows(rows: TableRow[]): TableRow[] {
  return JSON.parse(JSON.stringify(rows));
}

function deepCloneColumns(cols: TableColumn[]): TableColumn[] {
  return JSON.parse(JSON.stringify(cols));
}

const MAX_HISTORY = 50;

/**
 * 多维表格画布模型
 * 仅提供 JS 方法与数据，不依赖 React/DOM/业务；通过回调与业务通信。
 */
export class TableCanvasModel {
  private canvasConfig: Required<TableCanvasConfig>;
  private viewConfig: Required<TableCanvasViewConfig>;
  private table: MultiDimensionTable | null = null;
  private rows: TableRow[] = [];
  private columnWidths: Record<string, number> = {};
  private history: HistoryStep[] = [];
  private historyIndex: number = -1;
  private historyInitialized = false;
  private rollbackTarget: number | null = null;
  private isUndoRedo = false;
  private listeners = new Set<() => void>();
  private callbacks: TableModelCallbacks = {};

  constructor(options?: {
    canvas?: TableCanvasConfig;
    view?: TableCanvasViewConfig;
    callbacks?: TableModelCallbacks;
  }) {
    this.canvasConfig = { ...DEFAULT_CANVAS_CONFIG, ...options?.canvas };
    this.viewConfig = { ...DEFAULT_VIEW_CONFIG, ...options?.view };
    if (options?.callbacks) this.callbacks = options.callbacks;
  }

  /** 订阅快照变化（供 React useSyncExternalStore 等使用） */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  /** 当前状态快照 */
  getSnapshot(): TableModelSnapshot {
    const columns = this.table?.columns ?? [];
    return {
      table: this.table,
      rows: this.rows,
      columns,
      columnWidths: { ...this.columnWidths },
      history: [...this.history],
      historyIndex: this.historyIndex,
      canUndo: this.historyIndex > 0,
      canRedo: this.historyIndex < this.history.length - 1,
      canvasConfig: { ...this.canvasConfig },
      viewConfig: { ...this.viewConfig },
      historyInitialized: this.historyInitialized,
    };
  }

  /** 设置回调 */
  setCallbacks(callbacks: TableModelCallbacks): void {
    this.callbacks = callbacks;
  }

  // --------------- 配置 getter ---------------
  getCanvasConfig(): Required<TableCanvasConfig> {
    return { ...this.canvasConfig };
  }

  getViewConfig(): Required<TableCanvasViewConfig> {
    return { ...this.viewConfig };
  }

  setCanvasConfig(config: Partial<TableCanvasConfig>): void {
    this.canvasConfig = { ...this.canvasConfig, ...config };
    this.notify();
  }

  setViewConfig(config: Partial<TableCanvasViewConfig>): void {
    this.viewConfig = { ...this.viewConfig, ...config };
    this.notify();
  }

  // --------------- 数据 getter ---------------
  getTable(): MultiDimensionTable | null {
    return this.table;
  }

  getRows(): TableRow[] {
    return this.rows;
  }

  getColumns(): TableColumn[] {
    return this.table?.columns ?? [];
  }

  getColumnWidths(): Record<string, number> {
    return { ...this.columnWidths };
  }

  // --------------- 数据 setter（不记历史，用于外部同步） ---------------
  setTable(table: MultiDimensionTable | null): void {
    this.table = table;
    if (table) {
      const idKey = this.canvasConfig.idColumnKey;
      if (!this.columnWidths[idKey]) {
        this.columnWidths[idKey] = this.canvasConfig.idColumnWidth;
      }
    }
    this.notify();
  }

  setRows(rows: TableRow[]): void {
    this.rows = deepCloneRows(rows);
    this.notify();
    this.callbacks.onRowChange?.(this.rows);
    this.callbacks.onChange?.({ rows: this.rows, columns: this.getColumns() });
  }

  setColumns(columns: TableColumn[]): void {
    if (!this.table) return;
    this.table = { ...this.table, columns: deepCloneColumns(columns) };
    this.notify();
    this.callbacks.onColumnChange?.(this.table.columns);
    this.callbacks.onChange?.({ rows: this.rows, columns: this.table.columns });
  }

  /** 初始化表格数据并建立初始历史（仅调用一次或替换数据时） */
  setData(table: MultiDimensionTable | null, rows: TableRow[]): void {
    this.table = table;
    this.rows = deepCloneRows(rows);
    const idKey = this.canvasConfig.idColumnKey;
    if (table && !this.columnWidths[idKey]) {
      this.columnWidths[idKey] = this.canvasConfig.idColumnWidth;
    }
    const columns = table?.columns ?? [];
    const initialState: HistoryStep = {
      rows: deepCloneRows(this.rows),
      columns: deepCloneColumns(columns),
      stepType: "initial",
      stepTitle: "初始状态",
      stepDescription: "表格加载时的状态",
      timestamp: Date.now(),
    };
    this.history = [initialState];
    this.historyIndex = 0;
    this.historyInitialized = true;
    this.rollbackTarget = null;
    this.notify();
    this.emitHistoryChange();
  }

  setColumnWidth(key: string, width: number): void {
    this.columnWidths[key] = width;
    this.notify();
  }

  setColumnWidths(widths: Record<string, number>): void {
    this.columnWidths = { ...this.columnWidths, ...widths };
    this.notify();
  }

  // --------------- 历史（内部） ---------------
  private emitHistoryChange(): void {
    this.callbacks.onHistoryChange?.({
      history: [...this.history],
      index: this.historyIndex,
      canUndo: this.historyIndex > 0,
      canRedo: this.historyIndex < this.history.length - 1,
    });
  }

  /**
   * 记录一次历史（在数据变更后由调用方或 model 方法内部调用）
   * 若刚发生回滚，会从回滚点截断再追加
   */
  recordHistory(options?: {
    stepLabel?: string;
    stepType?: HistoryStepType;
    stepTitle?: string;
    stepDescription?: string;
  }): void {
    if (this.isUndoRedo || !this.historyInitialized || !this.table) return;
    const currentIndex = this.rollbackTarget !== null ? this.rollbackTarget : this.historyIndex;
    if (this.rollbackTarget !== null) this.rollbackTarget = null;

    const newStep: HistoryStep = {
      rows: deepCloneRows(this.rows),
      columns: deepCloneColumns(this.table.columns),
      ...options,
      timestamp: Date.now(),
    };

    const newHistory = this.history.slice(0, currentIndex + 1);
    newHistory.push(newStep);
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    this.history = newHistory;
    this.historyIndex = newHistory.length - 1;
    this.notify();
    this.emitHistoryChange();
  }

  undo(): boolean {
    if (this.historyIndex <= 0 || !this.table) return false;
    this.isUndoRedo = true;
    const prevIndex = this.historyIndex - 1;
    const prev = this.history[prevIndex];
    if (prev) {
      this.rows = deepCloneRows(prev.rows);
      this.table = { ...this.table, columns: deepCloneColumns(prev.columns) };
      this.historyIndex = prevIndex;
      this.notify();
      this.emitHistoryChange();
      this.callbacks.onRowChange?.(this.rows);
      this.callbacks.onColumnChange?.(this.table.columns);
      this.callbacks.onChange?.({ rows: this.rows, columns: this.table.columns });
    }
    setTimeout(() => {
      this.isUndoRedo = false;
    }, 0);
    return true;
  }

  redo(): boolean {
    if (this.historyIndex >= this.history.length - 1 || !this.table) return false;
    this.isUndoRedo = true;
    const nextIndex = this.historyIndex + 1;
    const next = this.history[nextIndex];
    if (next) {
      this.rows = deepCloneRows(next.rows);
      this.table = { ...this.table, columns: deepCloneColumns(next.columns) };
      this.historyIndex = nextIndex;
      this.notify();
      this.emitHistoryChange();
      this.callbacks.onRowChange?.(this.rows);
      this.callbacks.onColumnChange?.(this.table.columns);
      this.callbacks.onChange?.({ rows: this.rows, columns: this.table.columns });
    }
    setTimeout(() => {
      this.isUndoRedo = false;
    }, 0);
    return true;
  }

  rollbackTo(index: number): boolean {
    if (!this.table || index < 0 || index >= this.history.length) return false;
    const state = this.history[index];
    if (!state) return false;
    this.isUndoRedo = true;
    this.rows = deepCloneRows(state.rows);
    this.table = { ...this.table, columns: deepCloneColumns(state.columns) };
    this.historyIndex = index;
    this.rollbackTarget = index;
    this.notify();
    this.emitHistoryChange();
    this.callbacks.onRowChange?.(this.rows);
    this.callbacks.onColumnChange?.(this.table.columns);
    this.callbacks.onChange?.({ rows: this.rows, columns: this.table.columns });
    setTimeout(() => {
      this.isUndoRedo = false;
    }, 0);
    return true;
  }

  getHistory(): HistoryStep[] {
    return [...this.history];
  }

  getHistoryIndex(): number {
    return this.historyIndex;
  }

  canUndo(): boolean {
    return this.historyIndex > 0;
  }

  canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  // --------------- 数据变更方法（会触发 recordHistory，由业务或组件调用） ---------------

  /** 更新单元格 */
  updateCell(
    rowId: string,
    columnKey: string,
    value: string,
    historyOptions?: {
      stepTitle?: string;
      stepDescription?: string;
      stepLabel?: string;
    }
  ): void {
    if (!this.table) return;
    const row = this.rows.find((r) => r.id === rowId);
    if (!row) return;
    const displayId = row.row_id ?? rowId;
    const oldValue = row.cells?.[columnKey] ?? "";
    const newRows = this.rows.map((r) =>
      r.id === rowId ? { ...r, cells: { ...r.cells, [columnKey]: value } } : r
    );
    this.rows = newRows;
    const col = this.table.columns.find((c) => c.key === columnKey);
    const columnLabel = col?.label ?? columnKey;
    this.recordHistory({
      stepType: "update",
      stepTitle: historyOptions?.stepTitle ?? `ID ${displayId} 的「${columnLabel}」字段发生修改`,
      stepDescription: historyOptions?.stepDescription ?? `"${oldValue}" → "${value}"`,
      stepLabel: historyOptions?.stepLabel ?? `更新 ID 为 ${displayId} 的「${columnLabel}」`,
    });
    this.notify();
    this.callbacks.onRowChange?.(this.rows);
    this.callbacks.onChange?.({ rows: this.rows, columns: this.table.columns });
  }

  /** 追加或替换行（导入场景） */
  replaceRows(rows: TableRow[], mode: "append" | "replace" = "append"): void {
    if (!this.table) return;
    const newRows = mode === "replace" ? deepCloneRows(rows) : [...this.rows, ...deepCloneRows(rows)];
    this.rows = newRows;
    const modeText = mode === "replace" ? "替换" : "追加";
    this.recordHistory({
      stepType: "import",
      stepTitle: "导入数据",
      stepDescription: `${modeText}，共 ${newRows.length} 条`,
      stepLabel: `导入数据（${modeText}）`,
    });
    this.notify();
    this.callbacks.onRowChange?.(this.rows);
    this.callbacks.onChange?.({ rows: this.rows, columns: this.table!.columns });
  }

  /** 列顺序变更（拖拽排序） */
  reorderColumns(columnKeys: string[]): void {
    if (!this.table) return;
    const columns = columnKeys
      .map((key) => this.table!.columns.find((c) => c.key === key))
      .filter(Boolean) as TableColumn[];
    if (columns.length !== this.table.columns.length) return;
    this.table = { ...this.table, columns };
    this.recordHistory({
      stepType: "reorder",
      stepTitle: "调整列顺序",
      stepDescription: columnKeys.join(" → "),
      stepLabel: "列顺序已调整",
    });
    this.notify();
    this.callbacks.onColumnChange?.(this.table.columns);
    this.callbacks.onChange?.({ rows: this.rows, columns: this.table.columns });
  }

  /**
   * 应用一次“行/列”变更并记录历史（通用）
   * 业务层在添加行、删除行、添加列等操作后，先改 rows/table，再调用 applyChange 记录历史
   */
  applyChange(
    nextRows: TableRow[],
    nextColumns: TableColumn[],
    options: {
      stepType: HistoryStepType;
      stepTitle: string;
      stepDescription?: string;
      stepLabel?: string;
    }
  ): void {
    this.rows = deepCloneRows(nextRows);
    if (this.table) {
      this.table = { ...this.table, columns: deepCloneColumns(nextColumns) };
    }
    this.recordHistory(options);
    this.notify();
    this.callbacks.onRowChange?.(this.rows);
    this.callbacks.onColumnChange?.(this.table?.columns ?? []);
    this.callbacks.onChange?.({ rows: this.rows, columns: this.table?.columns ?? [] });
  }
}
