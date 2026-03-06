import { makeAutoObservable, runInAction } from "mobx";
import type { LayoutItem } from "@/lib/api/dashboard-config";
import { getDashboardConfig, saveDashboardConfig } from "@/lib/api/dashboard-config";
import { SIZE_PRESETS } from "@/app/dashboard/components/dashboard-widgets/types";
import type { WidgetType, WidgetSize } from "@/app/dashboard/components/dashboard-widgets/types";
import { logger } from "@/lib/utils/logger";

const CACHE_KEY = "dashboard_config_layout";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

function getCachedLayout(): LayoutItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { layout, ts } = JSON.parse(raw) as { layout: LayoutItem[]; ts: number };
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return Array.isArray(layout) ? layout : null;
  } catch {
    return null;
  }
}

function setCachedLayout(layout: LayoutItem[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ layout, ts: Date.now() }));
  } catch {
    // 忽略存储失败
  }
}

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "tables-1", x: 0, y: 0, w: 6, h: 3 },
  { i: "prompts-1", x: 6, y: 0, w: 6, h: 3 },
  { i: "team_code-1", x: 0, y: 3, w: 12, h: 4 },
];

/** 各类型组件的最小网格尺寸（防止拖拽/缩放过小） */
const MIN_LAYOUT: Record<string, { minW: number; minH: number }> = {
  tables: { minW: 4, minH: 2 },
  prompts: { minW: 4, minH: 2 },
  team_code: { minW: 2, minH: 2 },
};

function sanitizeLayout(items: LayoutItem[]) {
  return items.map((item) => {
    const { i, x, y, w, h } = item;
    const base: LayoutItem = { i, x, y, w, h };
    const prefix = i.split("-")[0];
    const mins = MIN_LAYOUT[prefix];
    if (mins && (item.minW == null || item.minH == null)) {
      base.minW = item.minW ?? mins.minW;
      base.minH = item.minH ?? mins.minH;
    }
    // 迁移旧 chart-* 布局：转为 tables 并设置 tableDisplayMode: "chart"
    const raw = item as LayoutItem & { chartTableId?: string; chartType?: string; chartCategoryColumnKey?: string; chartValueColumnKeys?: string[]; chartPieAggregate?: string };
    if (raw.chartTableId && i.startsWith("chart-")) {
      const extra: Partial<LayoutItem> = {
        tableId: raw.chartTableId,
        tableDisplayMode: "chart",
        tableChartType: (raw.chartType as "bar" | "pie" | "line") ?? "bar",
        tableChartCategoryColumnKey: raw.chartCategoryColumnKey ?? "",
        tableChartValueColumnKeys: raw.chartValueColumnKeys ?? [],
      };
      if (raw.chartPieAggregate) extra.tableChartPieAggregate = raw.chartPieAggregate as "sum" | "count";
      return { ...base, i: `tables-${i}`, ...extra, minW: base.minW ?? 4, minH: base.minH ?? 2 };
    }
    if ("tableId" in item && item.tableId) {
      const extra: Partial<LayoutItem> = { tableId: item.tableId };
      if (item.columnKeys && item.columnKeys.length > 0) extra.columnKeys = item.columnKeys;
      if (item.tableDisplayMode) extra.tableDisplayMode = item.tableDisplayMode;
      if (item.tableChartType) extra.tableChartType = item.tableChartType;
      if (item.tableChartCategoryColumnKey) extra.tableChartCategoryColumnKey = item.tableChartCategoryColumnKey;
      if (item.tableChartValueColumnKeys?.length) extra.tableChartValueColumnKeys = item.tableChartValueColumnKeys;
      if (item.tableChartPieAggregate) extra.tableChartPieAggregate = item.tableChartPieAggregate;
      // 保留列宽配置（如果存在）
      if ((item as any).tableColumnWidths) {
        (extra as any).tableColumnWidths = (item as any).tableColumnWidths;
      }
      return { ...base, ...extra, minW: base.minW ?? 4, minH: base.minH ?? 2 };
    }
    // 团队 Code 组件：保留展示模式与卡片配置（单选）
    if (i.startsWith("team_code-")) {
      const extra: Partial<LayoutItem> = {};
      if ((item as any).teamCodeDisplayMode) extra.teamCodeDisplayMode = (item as any).teamCodeDisplayMode;
      const cards = (item as any).teamCodeUsageCards;
      const card = (item as any).teamCodeUsageCard;
      const chartType = (item as any).teamCodeChartType;
      if (card) (extra as any).teamCodeUsageCard = card;
      else if (Array.isArray(cards) && cards.length > 0) (extra as any).teamCodeUsageCard = cards[0]; // 迁移：数组取首项
      if (chartType) (extra as any).teamCodeChartType = chartType;
      if (Object.keys(extra).length) return { ...base, ...extra, minW: base.minW ?? 4, minH: base.minH ?? 2 };
    }
    if (i.startsWith("prompts-")) {
      return { ...base, minW: base.minW ?? 4, minH: base.minH ?? 2 };
    }
    const fallbackMins = MIN_LAYOUT[i.split("-")[0]];
    if (fallbackMins) {
      return { ...base, minW: base.minW ?? fallbackMins.minW, minH: base.minH ?? fallbackMins.minH };
    }
    return base;
  });
}

function layoutEquals(a: LayoutItem[], b: LayoutItem[]): boolean {
  if (a.length !== b.length) return false;
  const key = (item: LayoutItem) =>
    `${item.i}:${item.x},${item.y},${item.w},${item.h}:${item.minW ?? ""}:${item.minH ?? ""}:${item.tableId ?? ""}:${(item.columnKeys ?? []).join(",")}:${item.tableDisplayMode ?? ""}:${item.tableChartType ?? ""}:${item.tableChartCategoryColumnKey ?? ""}:${(item.tableChartValueColumnKeys ?? []).join(",")}:${item.tableChartPieAggregate ?? ""}:${JSON.stringify((item as any).tableColumnWidths ?? {})}:${(item as any).teamCodeDisplayMode ?? ""}:${(item as any).teamCodeUsageCard ?? ""}:${(item as any).teamCodeChartType ?? ""}`;
  const setA = new Set(a.map(key));
  return b.every((item) => setA.has(key(item)));
}

export function nextWidgetId(layout: LayoutItem[], type: WidgetType): string {
  const prefix = `${type}-`;
  const existing = layout
    .filter((item) => item.i.startsWith(prefix))
    .map((item) => {
      const n = parseInt(item.i.slice(prefix.length), 10);
      return isNaN(n) ? 0 : n;
    });
  const max = existing.length > 0 ? Math.max(...existing) : 0;
  return `${prefix}${max + 1}`;
}

function getBottomY(layout: LayoutItem[]): number {
  if (layout.length === 0) return 0;
  return Math.max(...layout.map((item) => item.y + item.h));
}

class DashboardStore {
  layout: LayoutItem[] = DEFAULT_LAYOUT;
  loading = true;
  private autoSaveTimer: any = null;

  constructor() {
    makeAutoObservable(this);
  }

  async loadConfig() {
    const cached = getCachedLayout();
    if (cached?.length) {
      runInAction(() => {
        this.layout = cached;
        this.loading = false;
      });
    } else {
      this.loading = true;
    }

    try {
      const res = await getDashboardConfig();
      const raw = res.layout?.length ? res.layout : DEFAULT_LAYOUT;
      const items = sanitizeLayout(raw);
      runInAction(() => {
        this.layout = items;
        setCachedLayout(items);
      });
    } catch (err) {
      logger.error("加载工作台配置失败", err);
      runInAction(() => {
        if (!cached?.length) this.layout = DEFAULT_LAYOUT;
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /**
   * 持久化当前布局到服务端（仅在用户点击「完成」时调用）
   */
  async saveConfig() {
    const sanitized = sanitizeLayout(this.layout);
    try {
      const res = await saveDashboardConfig(sanitized);
      setCachedLayout(res.layout ?? sanitized);
    } catch (err) {
      logger.error("保存工作台配置失败", err);
      throw err;
    }
  }

  /**
   * 自动保存：用于列宽等轻量偏好更新，做简单防抖，避免频繁请求
   */
  scheduleAutoSave() {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    this.autoSaveTimer = setTimeout(() => {
      this.saveConfig().catch((err) => {
        logger.error("自动保存工作台配置失败", err);
      });
    }, 800);
  }

  /**
   * 更新布局。配置分为两类数据：
   * - 容器数据：x, y, w, h（位置、长宽）— 来自 react-grid-layout 的拖拽/缩放
   * - 信息数据：tableId, columnKeys 等 — 仅通过配置操作更新，拖拽/缩放不应覆盖
   * 合并时：容器数据用 newLayout；信息数据优先用 newLayout（来自 updateWidgetConfig），
   * 若 newLayout 未携带则保留 existing（来自拖拽/缩放时 react-grid-layout 不传这些字段）。
   */
  setLayout(newLayout: LayoutItem[]) {
    const merged = newLayout.map((newItem) => {
      const existing = this.layout.find((l) => l.i === newItem.i);
      const prefix = newItem.i.split("-")[0];
      const mins = MIN_LAYOUT[prefix];
      const minW = newItem.minW ?? existing?.minW ?? mins?.minW ?? 4;
      const minH = newItem.minH ?? existing?.minH ?? mins?.minH ?? 2;
      const item = { ...newItem, minW, minH };
      if (!existing) return item;
      return {
        ...item,
        tableId: newItem.tableId ?? existing.tableId,
        columnKeys: newItem.columnKeys ?? existing.columnKeys,
        tableDisplayMode: newItem.tableDisplayMode ?? existing.tableDisplayMode,
        tableChartType: newItem.tableChartType ?? existing.tableChartType,
        tableChartCategoryColumnKey: newItem.tableChartCategoryColumnKey ?? existing.tableChartCategoryColumnKey,
        tableChartValueColumnKeys: newItem.tableChartValueColumnKeys ?? existing.tableChartValueColumnKeys,
        tableChartPieAggregate: newItem.tableChartPieAggregate ?? existing.tableChartPieAggregate,
        tableColumnWidths: (newItem as any).tableColumnWidths ?? (existing as any).tableColumnWidths,
        teamCodeDisplayMode: (newItem as any).teamCodeDisplayMode ?? (existing as any).teamCodeDisplayMode,
        teamCodeUsageCard: (newItem as any).teamCodeUsageCard ?? (existing as any).teamCodeUsageCard,
        teamCodeChartType: (newItem as any).teamCodeChartType ?? (existing as any).teamCodeChartType,
      };
    });
    if (layoutEquals(this.layout, merged)) return;
    this.layout = merged;
  }

  addWidget(type: WidgetType, size: WidgetSize) {
    const id = nextWidgetId(this.layout, type);
    const { w, h } = SIZE_PRESETS[size];
    const y = getBottomY(this.layout);
    const mins = MIN_LAYOUT[type] ?? { minW: 4, minH: 2 };
    const newItem: LayoutItem = { i: id, x: 0, y, w, h, minW: mins.minW, minH: mins.minH };
    const next = [...this.layout, newItem];
    this.setLayout(next);
  }

  removeWidget(id: string) {
    this.setLayout(this.layout.filter((item) => item.i !== id));
  }

  updateWidgetConfig(
    id: string,
    config: {
      tableId?: string;
      columnKeys?: string[];
      tableDisplayMode?: "table" | "chart";
      tableChartType?: "bar" | "pie" | "line";
      tableChartCategoryColumnKey?: string;
      tableChartValueColumnKeys?: string[];
      tableChartPieAggregate?: "sum" | "count";
      tableColumnWidths?: Record<string, number>;
      teamCodeDisplayMode?: "authcode" | "usage" | "chart";
      teamCodeUsageCard?: "package" | "extra" | "rollover";
      teamCodeChartType?: "line" | "pie";
    }
  ) {
    const next = this.layout.map((item) =>
      item.i === id ? { ...item, ...config } : item
    );
    this.setLayout(next);
    // 列宽更新时触发一次自动保存（带防抖）
    if (config.tableColumnWidths) {
      this.scheduleAutoSave();
    }
  }
}

export const dashboardStore = new DashboardStore();
export { DEFAULT_LAYOUT };
