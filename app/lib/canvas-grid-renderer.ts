/**
 * Canvas 网格渲染器 - 框架无关的纯绘制逻辑
 *
 * 通过柯里化支持 React、Vue、原生 HTML 等不同场景：
 *
 * @example React
 *   const renderer = createCanvasGridRenderer({ formatCellValue })(canvasRef.current, containerRef.current);
 *
 * @example Vue
 *   const renderer = createCanvasGridRenderer()(canvasEl, containerEl);
 *
 * @example 原生 HTML
 *   const renderer = createCanvasGridRenderer()(document.querySelector('canvas'), document.querySelector('.container'));
 *
 * 业务逻辑通过 config 注入（formatCellValue 等），渲染器只负责绘制和坐标计算
 */

/** 列描述 - 无业务类型依赖 */
export interface GridColumn {
  key: string;
  width: number;
  headerLabel: string;
}

/** 行数据 - 通过 getter 获取，无业务类型依赖 */
export interface GridRow {
  getCellValue: (columnKey: string) => string;
  getRowId: () => string | number;
}

/** 单元格样式 */
export interface CellStyles {
  headerBg: string;
  cellBg: string;
  selectedBg: string;
  borderColor: string;
  headerText: string;
  cellText: string;
  headerFont: string;
  cellFont: string;
}

/** 从 DOM 元素解析 Tailwind/CSS 变量为实际颜色（支持暗色模式） */
export function resolveTailwindStyles(element: HTMLElement = document.documentElement): CellStyles {
  const style = getComputedStyle(element);
  const getVar = (cssVar: string, fallback: string) => {
    const v = style.getPropertyValue(cssVar).trim();
    return v && !v.startsWith("var(") ? v : fallback;
  };
  const fontFallback = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  return {
    headerBg: getVar("--muted", "#f5f5f5"),
    cellBg: getVar("--background", "#ffffff"),
    selectedBg: getVar("--accent", "#e3f2fd"),
    borderColor: getVar("--border", "#e0e0e0"),
    headerText: getVar("--foreground", "#333333"),
    cellText: getVar("--foreground", "#000000"),
    headerFont: `14px ${getVar("--font-sans", fontFallback)}`,
    cellFont: `13px ${getVar("--font-sans", fontFallback)}`,
  };
}

/** 渲染器配置 - 可扩展以支持不同框架 */
export interface CanvasGridRendererConfig {
  cellHeight?: number;
  headerHeight?: number;
  idColumnKey?: string;
  idColumnWidth?: number;
  defaultColumnWidth?: number;
  styles?: Partial<CellStyles>;
  /** 从 Tailwind 主题解析样式，传入容器或根元素；与 styles 同时存在时 styles 优先 */
  useTailwindTheme?: HTMLElement | (() => HTMLElement);
  /** 格式化单元格显示值，业务层注入 */
  formatCellValue?: (value: string, columnKey: string) => string;
}

const DEFAULT_STYLES: CellStyles = {
  headerBg: "#f5f5f5",
  cellBg: "#ffffff",
  selectedBg: "#e3f2fd",
  borderColor: "#e0e0e0",
  headerText: "#333333",
  cellText: "#000000",
  headerFont: "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  cellFont: "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const DEFAULT_CONFIG: Required<Omit<CanvasGridRendererConfig, "formatCellValue" | "styles" | "useTailwindTheme">> & {
  formatCellValue: (v: string) => string;
  styles: CellStyles;
} = {
  cellHeight: 40,
  headerHeight: 40,
  idColumnKey: "__id__",
  idColumnWidth: 120,
  defaultColumnWidth: 150,
  formatCellValue: (v) => v,
  styles: DEFAULT_STYLES,
};

/** 渲染器实例 API */
export interface CanvasGridRendererInstance {
  resize: () => void;
  render: (options?: { skipHeader?: boolean }) => void;
  /** 仅绘制表头到指定 canvas，用于吸顶表头的定位层 */
  renderHeader: (headerCanvas: HTMLCanvasElement) => void;
  updateData: (columns: GridColumn[], rows: GridRow[], columnWidths: Record<string, number>) => void;
  setColumnWidths: (widths: Record<string, number>) => void;
  getCellAt: (x: number, y: number) => { rowIndex: number; colKey: string | null } | null;
  getCellRect: (rowIndex: number, colKey: string | null) => { x: number; y: number; width: number; height: number } | null;
}

/** 文本截断 - 二分查找最优长度，避免 measureText 多次调用 */
function truncateText(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  ellipsis: string = "..."
): string {
  if (!value || maxWidth <= 0) return "";
  const fullWidth = ctx.measureText(value).width;
  if (fullWidth <= maxWidth) return value;
  const ellipsisWidth = ctx.measureText(ellipsis).width;
  const maxTextWidth = maxWidth - ellipsisWidth;
  if (maxTextWidth <= 0) return ellipsis;

  let low = 0;
  let high = value.length;
  let bestFit = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const testWidth = ctx.measureText(value.substring(0, mid)).width;
    if (testWidth <= maxTextWidth) {
      bestFit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return value.substring(0, bestFit) + ellipsis;
}

/**
 * 柯里化工厂：创建 Canvas 网格渲染器
 *
 * @example React
 *   const renderer = createCanvasGridRenderer({ formatCellValue: myFormatter })(canvasRef.current, containerRef.current);
 *
 * @example Vue
 *   const renderer = createCanvasGridRenderer({ formatCellValue: (v, k) => formatForVue(v, k) })(canvasEl, containerEl);
 *
 * @example 原生 HTML
 *   const renderer = createCanvasGridRenderer()(document.querySelector('canvas'), document.querySelector('.container'));
 */
export function createCanvasGridRenderer(
  userConfig: CanvasGridRendererConfig = {}
): (canvas: HTMLCanvasElement, container: HTMLElement) => CanvasGridRendererInstance {
  const config = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    styles: userConfig.styles
      ? { ...DEFAULT_STYLES, ...userConfig.styles }
      : DEFAULT_STYLES,
    formatCellValue: userConfig.formatCellValue ?? DEFAULT_CONFIG.formatCellValue,
    useTailwindTheme: userConfig.useTailwindTheme,
  };

  const {
    cellHeight,
    headerHeight,
    idColumnKey,
    idColumnWidth: defaultIdWidth,
    defaultColumnWidth,
    styles: configStyles,
    formatCellValue,
    useTailwindTheme,
  } = config;

  return (canvas: HTMLCanvasElement, container: HTMLElement): CanvasGridRendererInstance => {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("无法获取 Canvas 2D 上下文");

    let devicePixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    let viewportWidth = 0;
    let viewportHeight = 0;
    let columns: GridColumn[] = [];
    let rows: GridRow[] = [];
    let columnWidths: Record<string, number> = {};

    const getIdColumnWidth = () => columnWidths[idColumnKey] ?? defaultIdWidth;
    const getColumnWidth = (col: GridColumn) =>
      columnWidths[col.key] ?? col.width ?? defaultColumnWidth;

    /** 当前使用的样式（支持运行时从 Tailwind 主题解析） */
    const getStyles = (): CellStyles => {
      if (useTailwindTheme) {
        const el = typeof useTailwindTheme === "function" ? useTailwindTheme() : useTailwindTheme;
        return el ? resolveTailwindStyles(el) : configStyles;
      }
      return configStyles;
    };

    /** 绘制单个单元格 - 纯绘制，无业务逻辑 */
    const drawCell = (
      x: number,
      y: number,
      width: number,
      height: number,
      value: string,
      isHeader: boolean,
      isSelected: boolean = false
    ) => {
      const s = getStyles();
      ctx.fillStyle = isHeader ? s.headerBg : isSelected ? s.selectedBg : s.cellBg;
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = s.borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, width, height);

      if (value && width > 0) {
        ctx.fillStyle = isHeader ? s.headerText : s.cellText;
        ctx.font = isHeader ? s.headerFont : s.cellFont;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        const padding = 8;
        const textX = x + padding;
        const textY = y + height / 2;
        const maxWidth = Math.max(0, width - padding * 2);
        if (maxWidth > 0) {
          const displayText = ctx.measureText(value).width > maxWidth
            ? truncateText(ctx, value, maxWidth)
            : value;
          ctx.fillText(displayText, textX, textY);
        }
      }
    };

    const resize = () => {
      viewportWidth = container.clientWidth;
      viewportHeight = container.clientHeight;
      const w = viewportWidth * devicePixelRatio;
      const h = viewportHeight * devicePixelRatio;
      canvas.width = w;
      canvas.height = h;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(devicePixelRatio, devicePixelRatio);
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
    };

    /** 绘制表头到指定 canvas（用于吸顶表头的定位层） */
    const renderHeader = (headerCanvas: HTMLCanvasElement) => {
      const scrollX = container.scrollLeft;
      const hCtx = headerCanvas.getContext("2d", { alpha: false });
      if (!hCtx) return;
      const hW = headerCanvas.width / (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
      const hH = headerCanvas.height / (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      hCtx.setTransform(1, 0, 0, 1, 0, 0);
      hCtx.scale(dpr, dpr);
      hCtx.clearRect(0, 0, hW, hH);
      const s = getStyles();
      hCtx.fillStyle = s.headerBg;
      hCtx.fillRect(0, 0, hW, hH);
      const idWidth = getIdColumnWidth();
      const idHeaderX = -scrollX;
      if (idHeaderX + idWidth > 0 && idHeaderX < hW) {
        const actualX = Math.max(0, idHeaderX);
        const actualWidth = idHeaderX < 0 ? idWidth + idHeaderX : idWidth;
        if (actualWidth > 0) {
          hCtx.fillStyle = s.headerBg;
          hCtx.fillRect(actualX, 0, actualWidth, headerHeight);
          hCtx.strokeStyle = s.borderColor;
          hCtx.lineWidth = 1;
          hCtx.strokeRect(actualX, 0, actualWidth, headerHeight);
          hCtx.fillStyle = s.headerText;
          hCtx.font = s.headerFont;
          hCtx.textBaseline = "middle";
          hCtx.textAlign = "left";
          hCtx.fillText("ID", actualX + 8, headerHeight / 2);
        }
      }
      let colX = idWidth - scrollX;
      for (const col of columns) {
        const width = getColumnWidth(col);
        if (colX + width > 0 && colX < hW) {
          hCtx.fillStyle = s.headerBg;
          hCtx.fillRect(colX, 0, width, headerHeight);
          hCtx.strokeStyle = s.borderColor;
          hCtx.strokeRect(colX, 0, width, headerHeight);
          hCtx.fillStyle = s.headerText;
          hCtx.font = s.headerFont;
          const display = col.headerLabel && hCtx.measureText(col.headerLabel).width > width - 16
            ? truncateText(hCtx, col.headerLabel, width - 16)
            : col.headerLabel;
          hCtx.fillText(display || "", colX + 8, headerHeight / 2);
        }
        colX += width;
      }
    };

    const render = (options?: { skipHeader?: boolean }) => {
      const scrollX = container.scrollLeft;
      const scrollY = container.scrollTop;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(devicePixelRatio, devicePixelRatio);
      ctx.clearRect(0, 0, viewportWidth, viewportHeight);
      const s = getStyles();
      ctx.fillStyle = s.cellBg;
      ctx.fillRect(0, 0, viewportWidth, viewportHeight);

      const idWidth = getIdColumnWidth();
      let colX = idWidth - scrollX;

      if (!options?.skipHeader) {
        // 表头 - ID 列
        const idHeaderX = -scrollX;
        if (idHeaderX + idWidth > 0 && idHeaderX < viewportWidth) {
          const actualX = Math.max(0, idHeaderX);
          const actualWidth = idHeaderX < 0 ? idWidth + idHeaderX : idWidth;
          if (actualWidth > 0) drawCell(actualX, 0, actualWidth, headerHeight, "ID", true);
        }

        // 表头 - 数据列
        colX = idWidth - scrollX;
        for (const col of columns) {
          const width = getColumnWidth(col);
          if (colX + width > 0 && colX < viewportWidth) {
            drawCell(colX, 0, width, headerHeight, col.headerLabel, true);
          }
          colX += width;
        }
      }

      // 数据行 - 虚拟化：只绘制可见行
      // 当 rowY < headerHeight 时（如 scrollY=20 或 scrollY=40 等），数据行会与表头重叠；始终裁剪表头区域，避免数据行覆盖表头
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, headerHeight, viewportWidth, viewportHeight - headerHeight);
      ctx.clip();
      const startRow = Math.max(
        0,
        Math.ceil((scrollY - headerHeight - cellHeight) / cellHeight)
      );
      const endRow = Math.min(
        rows.length - 1,
        Math.floor((scrollY + viewportHeight - headerHeight) / cellHeight)
      );
      for (let rowIdx = startRow; rowIdx <= endRow; rowIdx++) {
        const row = rows[rowIdx];
        const rowY = headerHeight + rowIdx * cellHeight - scrollY;
        if (rowY + cellHeight < 0 || rowY > viewportHeight) continue;

        // ID 单元格
        const idCellX = -scrollX;
        if (idCellX + idWidth > 0 && idCellX < viewportWidth) {
          const actualX = Math.max(0, idCellX);
          const actualWidth = idCellX < 0 ? idWidth + idCellX : idWidth;
          if (actualWidth > 0) {
            drawCell(actualX, rowY, actualWidth, cellHeight, String(row.getRowId()), false);
          }
        }

        // 数据单元格
        colX = idWidth - scrollX;
        for (const col of columns) {
          const width = getColumnWidth(col);
          if (colX + width > 0 && colX < viewportWidth) {
            const raw = row.getCellValue(col.key);
            const display = formatCellValue(raw, col.key);
            drawCell(colX, rowY, width, cellHeight, display, false);
          }
          colX += width;
        }
      }
      ctx.restore();
    };

    const updateData = (
      newColumns: GridColumn[],
      newRows: GridRow[],
      newColumnWidths: Record<string, number>
    ) => {
      columns = newColumns;
      rows = newRows;
      columnWidths = { ...columnWidths, ...newColumnWidths };
    };

    const setColumnWidths = (widths: Record<string, number>) => {
      columnWidths = { ...columnWidths, ...widths };
    };

    const getCellAt = (x: number, y: number): { rowIndex: number; colKey: string | null } | null => {
      const scrollY = container.scrollTop;
      const scrollX = container.scrollLeft;
      if (y < headerHeight) return null;

      const rowIndex = Math.floor((y - headerHeight + scrollY) / cellHeight);
      if (rowIndex < 0 || rowIndex >= rows.length) return null;

      const idWidth = getIdColumnWidth();
      const adjustedX = x + scrollX;
      if (adjustedX >= 0 && adjustedX < idWidth) return { rowIndex, colKey: null };

      let colX = idWidth;
      for (const col of columns) {
        const width = getColumnWidth(col);
        if (adjustedX >= colX && adjustedX < colX + width) {
          return { rowIndex, colKey: col.key };
        }
        colX += width;
      }
      return null;
    };

    const getCellRect = (
      rowIndex: number,
      colKey: string | null
    ): { x: number; y: number; width: number; height: number } | null => {
      const scrollY = container.scrollTop;
      const scrollX = container.scrollLeft;
      if (rowIndex < 0 || rowIndex >= rows.length) return null;

      const idWidth = getIdColumnWidth();
      let x = 0;
      let width = idWidth;

      if (colKey) {
        x = idWidth;
        for (const col of columns) {
          const colWidth = getColumnWidth(col);
          if (col.key === colKey) {
            width = colWidth;
            break;
          }
          x += colWidth;
        }
      }

      return {
        x: x - scrollX,
        y: headerHeight + rowIndex * cellHeight - scrollY,
        width,
        height: cellHeight,
      };
    };

    resize();
    return {
      resize,
      render,
      renderHeader,
      updateData,
      setColumnWidths,
      getCellAt,
      getCellRect,
    };
  };
}
