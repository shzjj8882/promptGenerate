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

/** 列类型图标（用于 Canvas 路径绘制） */
export type HeaderIconType = "text" | "number" | "date" | "single_select" | "multi_select" | "add_column";

/** 列描述 - 无业务类型依赖 */
export interface GridColumn {
  key: string;
  width: number;
  headerLabel: string;
  /** 表头文本左侧偏移（用于为列类型 icon 留空） */
  headerTextOffset?: number;
  /** 列类型图标，在 Canvas 中用路径 API 绘制 */
  headerIconType?: HeaderIconType;
  /** 表头最右侧是否绘制下拉箭头（始终显示） */
  headerDropdownArrow?: boolean;
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
  /** 表头背景与单元格相同（用于区分 header 与 body 时仅靠列类型 icon，不靠背景色） */
  headerBgSameAsCell?: boolean;
  /** 自定义滚动值（用于 split 布局：横向 scroll 在父级，纵向在 body 容器） */
  getScroll?: () => { scrollX: number; scrollY: number };
  /** 仅绘制 body（用于 split 布局的 body canvas，表头单独绘制） */
  bodyOnly?: boolean;
  /** 数据列区域左侧偏移（如固定列总宽），数据列从 idColumnWidth + dataAreaLeftOffset 开始绘制 */
  dataAreaLeftOffset?: number;
  /** 固定列（key + width），用于 getHeaderColumnAt 在固定区内返回列 key */
  pinnedColumns?: { key: string; width: number }[];
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

const DEFAULT_CONFIG: Required<Omit<CanvasGridRendererConfig, "formatCellValue" | "styles" | "useTailwindTheme" | "getScroll" | "dataAreaLeftOffset" | "pinnedColumns">> & {
  formatCellValue: (v: string) => string;
  styles: CellStyles;
  getScroll?: () => { scrollX: number; scrollY: number };
  dataAreaLeftOffset?: number;
  pinnedColumns?: { key: string; width: number }[];
} = {
  cellHeight: 40,
  headerHeight: 40,
  idColumnKey: "__id__",
  idColumnWidth: 120,
  defaultColumnWidth: 150,
  formatCellValue: (v) => v,
  styles: DEFAULT_STYLES,
  headerBgSameAsCell: false,
  bodyOnly: false,
  dataAreaLeftOffset: 0,
  pinnedColumns: undefined,
};

/** 列宽拖拽 hit 区域（移动端触摸需更大以便拖拽） */
const RESIZE_HIT_MARGIN = 12;

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
  /** 表头 Resize 区域 hit 检测：返回被点击的列 key */
  getResizeHandleAt: (x: number, y: number) => string | null;
  /** 表头列 hit 检测：返回被点击的列 key（用于打开列菜单） */
  getHeaderColumnAt: (x: number, y: number) => string | null;
}

const ICON_SIZE = 16;
const ICON_PADDING = 8;

/** 在 Canvas 中用路径 API 绘制列类型图标；add_column 时可传 cellWidth 使加号水平居中 */
function drawHeaderIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellHeight: number,
  iconType: HeaderIconType,
  color: string,
  cellWidth?: number
) {
  const cy = y + cellHeight / 2;
  const s = ICON_SIZE / 2 - 2;
  const cx =
    iconType === "add_column" && cellWidth != null
      ? x + cellWidth / 2
      : x + ICON_PADDING + ICON_SIZE / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const drawSvgIcon = (pathD: string) => {
    const iconX = x + ICON_PADDING;
    const iconY = y + (cellHeight - ICON_SIZE) / 2;
    const scale = ICON_SIZE / 48;
    ctx.save();
    ctx.translate(iconX, iconY);
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "miter";
    ctx.stroke(new Path2D(pathD));
    ctx.restore();
  };

  switch (iconType) {
    case "number":
      // 数字：横线 + 数字/符号（viewBox 0 0 48 48）
      drawSvgIcon(
        "M20 9H42 M20 19H42 M20 29H42 M20 39H42 M6 29H12V32L6 38V39H12 M7 11L9 9V19M9 19H7M9 19H11"
      );
      break;
    case "date":
      // 日期：日历（viewBox 0 0 48 48）
      drawSvgIcon(
        "M5 19H43V40C43 41.1046 42.1046 42 41 42H7C5.89543 42 5 41.1046 5 40V19Z M5 9C5 7.89543 5.89543 7 7 7H41C42.1046 7 43 7.89543 43 9V19H5V9Z M16 4V12 M32 4V12 M28 34H34 M14 34H20 M28 26H34 M14 26H20"
      );
      break;
    case "single_select":
      // 单选：外圆 + 内圆（viewBox 0 0 48 48）
      drawSvgIcon("M44 24A20 20 0 0 1 24 44A20 20 0 0 1 4 24A20 20 0 0 1 24 4A20 20 0 0 1 44 24 M32 24A8 8 0 0 1 24 32A8 8 0 0 1 16 24A8 8 0 0 1 24 16A8 8 0 0 1 32 24");
      break;
    case "multi_select":
      // 多选：三条横线 + 左侧三个方框（viewBox 0 0 48 48）
      drawSvgIcon("M20 24H44 M20 38H44 M20 10H44 M4 34H12V42H4V34Z M4 20H12V28H4V20Z M4 6H12V14H4V6Z");
      break;
    case "add_column": {
      // 添加列：加号（cellWidth 传入时已居中为 cx = x + cellWidth/2）
      const half = ICON_SIZE / 2 - 2;
      ctx.beginPath();
      ctx.moveTo(cx - half, cy);
      ctx.lineTo(cx + half, cy);
      ctx.moveTo(cx, cy - half);
      ctx.lineTo(cx, cy + half);
      ctx.stroke();
      break;
    }
    case "text":
    default: {
      // 文本图标：使用设计稿 SVG 路径（viewBox 0 0 48 48），缩放到 ICON_SIZE
      const iconX = x + ICON_PADDING;
      const iconY = y + (cellHeight - ICON_SIZE) / 2;
      const scale = ICON_SIZE / 48;
      ctx.save();
      ctx.translate(iconX, iconY);
      ctx.scale(scale, scale);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "miter";
      const textIconPath = new Path2D(
        "M4 42L8.94118 30M32 42L27.0588 30M27.0588 30L25 25L18 8L11 25L8.94118 30M27.0588 30H8.94118 M28 10L44 10 M32 20L44 20 M36 30L44 30 M40 40H44"
      );
      ctx.stroke(textIconPath);
      ctx.restore();
      break;
    }
  }
}

const DROPDOWN_ARROW_SIZE = 6;
const DROPDOWN_ARROW_PAD = 10;

/** 在表头单元格右侧绘制下拉箭头（始终显示） */
function drawHeaderDropdownArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string
) {
  const cx = x + width - DROPDOWN_ARROW_PAD - DROPDOWN_ARROW_SIZE;
  const cy = y + height / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - DROPDOWN_ARROW_SIZE, cy - DROPDOWN_ARROW_SIZE * 0.6);
  ctx.lineTo(cx, cy + DROPDOWN_ARROW_SIZE * 0.6);
  ctx.lineTo(cx + DROPDOWN_ARROW_SIZE, cy - DROPDOWN_ARROW_SIZE * 0.6);
  ctx.stroke();
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
    getScroll,
    bodyOnly,
    dataAreaLeftOffset = 0,
    pinnedColumns = [],
  } = config;

  return (canvas: HTMLCanvasElement, container: HTMLElement): CanvasGridRendererInstance => {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("无法获取 Canvas 2D 上下文");

    const headerBgSameAsCell = userConfig.headerBgSameAsCell ?? false;

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
      let s: CellStyles;
      if (useTailwindTheme) {
        const el = typeof useTailwindTheme === "function" ? useTailwindTheme() : useTailwindTheme;
        s = el ? resolveTailwindStyles(el) : configStyles;
      } else {
        s = configStyles;
      }
      if (headerBgSameAsCell) {
        s = { ...s, headerBg: s.cellBg };
      }
      return s;
    };

    /** 绘制单个单元格 - 纯绘制，无业务逻辑；headerIconType 时在 Canvas 中绘制图标；headerDropdownArrow 时在表头右侧绘制下拉箭头 */
    const drawCell = (
      x: number,
      y: number,
      width: number,
      height: number,
      value: string,
      isHeader: boolean,
      isSelected: boolean = false,
      textOffset: number = 0,
      headerIconType?: HeaderIconType,
      headerDropdownArrow?: boolean
    ) => {
      const s = getStyles();
      ctx.fillStyle = isHeader ? s.headerBg : isSelected ? s.selectedBg : s.cellBg;
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = s.borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, width, height);

      if (isHeader && headerIconType && width > ICON_PADDING + ICON_SIZE) {
        drawHeaderIcon(
          ctx,
          x,
          y,
          height,
          headerIconType,
          s.headerText,
          headerIconType === "add_column" ? width : undefined
        );
      }

      if (isHeader && headerDropdownArrow && width > DROPDOWN_ARROW_PAD + DROPDOWN_ARROW_SIZE * 2) {
        drawHeaderDropdownArrow(ctx, x, y, width, height, s.headerText);
      }

      if (value && width > 0) {
        ctx.fillStyle = isHeader ? s.headerText : s.cellText;
        ctx.font = isHeader ? s.headerFont : s.cellFont;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        const padding = 8;
        const textX = x + padding + textOffset;
        const textY = y + height / 2;
        const maxWidth = Math.max(0, width - padding * 2 - textOffset);
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
      const w = Math.floor(viewportWidth * devicePixelRatio);
      const h = Math.floor(viewportHeight * devicePixelRatio);
      canvas.width = w;
      canvas.height = h;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(devicePixelRatio, devicePixelRatio);
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
    };

    /** 绘制表头到指定 canvas（用于吸顶表头的定位层） */
    const renderHeader = (headerCanvas: HTMLCanvasElement) => {
      const scrollX = getScroll ? getScroll().scrollX : container.scrollLeft;
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
      // ID 列表头固定左侧，不随横向滚动
      if (idWidth > 0 && hW > 0) {
        const actualWidth = Math.min(idWidth, hW);
        if (actualWidth > 0) {
          hCtx.fillStyle = s.headerBg;
          hCtx.fillRect(0, 0, actualWidth, headerHeight);
          hCtx.strokeStyle = s.borderColor;
          hCtx.lineWidth = 1;
          hCtx.strokeRect(0, 0, actualWidth, headerHeight);
          hCtx.fillStyle = s.headerText;
          hCtx.font = s.headerFont;
          hCtx.textBaseline = "middle";
          hCtx.textAlign = "left";
          hCtx.fillText("ID", 8, headerHeight / 2);
        }
      }
      let colX = idWidth + dataAreaLeftOffset - scrollX;
      for (const col of columns) {
        const width = getColumnWidth(col);
        if (colX + width > 0 && colX < hW) {
          hCtx.fillStyle = s.headerBg;
          hCtx.fillRect(colX, 0, width, headerHeight);
          hCtx.strokeStyle = s.borderColor;
          hCtx.strokeRect(colX, 0, width, headerHeight);
          if (col.headerIconType && width > ICON_PADDING + ICON_SIZE) {
            drawHeaderIcon(hCtx, colX, 0, headerHeight, col.headerIconType, s.headerText);
          }
          hCtx.fillStyle = s.headerText;
          hCtx.font = s.headerFont;
          const offset = col.headerTextOffset ?? 0;
          const display = col.headerLabel && hCtx.measureText(col.headerLabel).width > width - 16 - offset
            ? truncateText(hCtx, col.headerLabel, width - 16 - offset)
            : col.headerLabel;
          hCtx.fillText(display || "", colX + 8 + offset, headerHeight / 2);
          if (col.headerDropdownArrow && width > DROPDOWN_ARROW_PAD + DROPDOWN_ARROW_SIZE * 2) {
            drawHeaderDropdownArrow(hCtx, colX, 0, width, headerHeight, s.headerText);
          }
        }
        colX += width;
      }
    };

    const render = (options?: { skipHeader?: boolean }) => {
      const scroll = getScroll
        ? getScroll()
        : { scrollX: container.scrollLeft, scrollY: container.scrollTop };
      const scrollX = scroll.scrollX;
      const scrollY = scroll.scrollY;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(devicePixelRatio, devicePixelRatio);
      ctx.clearRect(0, 0, viewportWidth, viewportHeight);
      const s = getStyles();
      ctx.fillStyle = s.cellBg;
      ctx.fillRect(0, 0, viewportWidth, viewportHeight);

      const idWidth = getIdColumnWidth();
      let colX = idWidth - scrollX;
      const bodyTop = bodyOnly ? 0 : headerHeight;

      if (!bodyOnly && !options?.skipHeader) {
        // 表头 - ID 列（固定左侧，不随横向滚动，与 X 轴表头一致）
        if (idWidth > 0 && viewportWidth > 0) {
          const actualIdHeaderWidth = Math.min(idWidth, viewportWidth);
          if (actualIdHeaderWidth > 0) drawCell(0, 0, actualIdHeaderWidth, headerHeight, "ID", true);
        }

        // 表头 - 数据列（含最后一列「添加列」，随内容横向滚动）
        colX = idWidth + dataAreaLeftOffset - scrollX;
        for (const col of columns) {
          const width = getColumnWidth(col);
          if (colX + width > 0 && colX < viewportWidth) {
            drawCell(colX, 0, width, headerHeight, col.headerLabel, true, false, col.headerTextOffset ?? 0, col.headerIconType, col.headerDropdownArrow);
          }
          colX += width;
        }
      }

      // 数据行 - 虚拟化：使用 GridCoordinate 对齐 APITable 的 startRow/endRow 计算公式
      // bodyOnly 时无表头，rowY 从 0 起；否则裁剪表头区域，避免数据行覆盖表头
      ctx.save();
      if (!bodyOnly) {
        ctx.beginPath();
        ctx.rect(0, headerHeight, viewportWidth, viewportHeight - headerHeight);
        ctx.clip();
      }
      // scrollY 为 body 区域滚动偏移（不含表头）；bodyTop 为表头高度，用于将 body 内容画在视口正确位置
      const bodyHeight = viewportHeight - bodyTop;
      const startRow =
        rows.length > 0 ? Math.max(0, Math.floor(scrollY / cellHeight)) : 0;
      const endRow =
        rows.length > 0
          ? Math.min(
              rows.length - 1,
              Math.max(startRow, Math.ceil((scrollY + bodyHeight) / cellHeight) - 1)
            )
          : 0;
      for (let rowIdx = startRow; rowIdx <= endRow; rowIdx++) {
        const row = rows[rowIdx];
        if (!row) continue;
        const rowY = bodyTop + rowIdx * cellHeight - scrollY;
        if (rowY + cellHeight < 0 || rowY > viewportHeight) continue;

        // ID 单元格（固定左侧，不随横向滚动）
        if (idWidth > 0 && viewportWidth > 0) {
          const actualIdCellWidth = Math.min(idWidth, viewportWidth);
          if (actualIdCellWidth > 0) {
            drawCell(0, rowY, actualIdCellWidth, cellHeight, String(row.getRowId()), false);
          }
        }

        // 数据单元格（跳过「添加列」，body 不绘制该列内容）
        colX = idWidth + dataAreaLeftOffset - scrollX;
        for (const col of columns) {
          const width = getColumnWidth(col);
          if (col.key === "__add_column__") {
            colX += width;
            continue;
          }
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
      const scroll = getScroll
        ? getScroll()
        : { scrollX: container.scrollLeft, scrollY: container.scrollTop };
      const { scrollX, scrollY } = scroll;
      const top = bodyOnly ? 0 : headerHeight;
      if (y < top) return null;

      const rowIndex = Math.floor((y - top + scrollY) / cellHeight);
      if (rowIndex < 0 || rowIndex >= rows.length) return null;

      const idWidth = getIdColumnWidth();
      // ID 列固定左侧，视口 x 在 [0, idWidth) 为 ID 列
      if (x >= 0 && x < idWidth) return { rowIndex, colKey: null };
      // 固定列区域（由 DOM 覆盖层绘制），不命中 canvas 数据列
      if (x >= idWidth && x < idWidth + dataAreaLeftOffset) return null;

      const adjustedX = x + scrollX;
      let colX = idWidth + dataAreaLeftOffset;
      for (const col of columns) {
        const width = getColumnWidth(col);
        if (adjustedX >= colX && adjustedX < colX + width) {
          if (col.key === "__add_column__") return null;
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
      const scroll = getScroll
        ? getScroll()
        : { scrollX: container.scrollLeft, scrollY: container.scrollTop };
      const { scrollX, scrollY } = scroll;
      if (rowIndex < 0 || rowIndex >= rows.length) return null;

      const idWidth = getIdColumnWidth();
      const top = bodyOnly ? 0 : headerHeight;
      // ID 列固定左侧，视口 x 恒为 0
      if (!colKey) {
        return { x: 0, y: top + rowIndex * cellHeight - scrollY, width: idWidth, height: cellHeight };
      }
      let x = idWidth + dataAreaLeftOffset;
      let width = idWidth;
      for (const col of columns) {
        const colWidth = getColumnWidth(col);
        if (col.key === colKey) {
          width = colWidth;
          break;
        }
        x += colWidth;
      }
      return {
        x: x - scrollX,
        y: top + rowIndex * cellHeight - scrollY,
        width,
        height: cellHeight,
      };
    };

    const getResizeHandleAt = (x: number, y: number): string | null => {
      if (bodyOnly || y < 0 || y >= headerHeight) return null;
      const scroll = getScroll
        ? getScroll()
        : { scrollX: container.scrollLeft, scrollY: container.scrollTop };
      const idWidth = getIdColumnWidth();
      // ID 列右边缘固定于视口 x = idWidth
      if (Math.abs(x - idWidth) <= RESIZE_HIT_MARGIN) return idColumnKey;
      // 固定列右边缘（视口内固定，不随 scrollX 移动）
      if (dataAreaLeftOffset > 0 && pinnedColumns.length > 0) {
        let px = idWidth;
        for (const pin of pinnedColumns) {
          const right = px + pin.width;
          if (Math.abs(x - right) <= RESIZE_HIT_MARGIN) return pin.key;
          px = right;
        }
      }
      const adjustedX = x + scroll.scrollX;
      let colX = idWidth + dataAreaLeftOffset;
      for (const col of columns) {
        const width = getColumnWidth(col);
        const rightEdge = colX + width;
        if (Math.abs(adjustedX - rightEdge) <= RESIZE_HIT_MARGIN) {
          if (col.key === "__add_column__") return null;
          return col.key;
        }
        colX = rightEdge;
      }
      return null;
    };

    const getHeaderColumnAt = (x: number, y: number): string | null => {
      if (bodyOnly || y < 0 || y >= headerHeight) return null;
      const idWidth = getIdColumnWidth();
      // ID 列固定左侧，视口 x 在 [0, idWidth) 为 ID 列表头
      if (x >= 0 && x < idWidth) return idColumnKey;
      // 固定列区域：命中对应固定列以便 overlay 显示下拉/菜单
      if (dataAreaLeftOffset > 0 && x >= idWidth && x < idWidth + dataAreaLeftOffset && pinnedColumns.length > 0) {
        let px = idWidth;
        for (const pin of pinnedColumns) {
          if (x >= px && x < px + pin.width) return pin.key;
          px += pin.width;
        }
      }
      const scroll = getScroll
        ? getScroll()
        : { scrollX: container.scrollLeft, scrollY: container.scrollTop };
      const adjustedX = x + scroll.scrollX;
      let colX = idWidth + dataAreaLeftOffset;
      for (const col of columns) {
        const width = getColumnWidth(col);
        if (adjustedX >= colX && adjustedX < colX + width) return col.key;
        colX += width;
      }
      return null;
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
      getResizeHandleAt,
      getHeaderColumnAt,
    };
  };
}
