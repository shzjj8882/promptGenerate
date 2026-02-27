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

function sanitizeLayout(items: LayoutItem[]) {
  return items.map((item) => {
    const { i, x, y, w, h } = item;
    const base = { i, x, y, w, h };
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
      return { ...base, i: `tables-${i}`, ...extra };
    }
    if ("tableId" in item && item.tableId) {
      const extra: Partial<LayoutItem> = { tableId: item.tableId };
      if (item.columnKeys && item.columnKeys.length > 0) extra.columnKeys = item.columnKeys;
      if (item.tableDisplayMode) extra.tableDisplayMode = item.tableDisplayMode;
      if (item.tableChartType) extra.tableChartType = item.tableChartType;
      if (item.tableChartCategoryColumnKey) extra.tableChartCategoryColumnKey = item.tableChartCategoryColumnKey;
      if (item.tableChartValueColumnKeys?.length) extra.tableChartValueColumnKeys = item.tableChartValueColumnKeys;
      if (item.tableChartPieAggregate) extra.tableChartPieAggregate = item.tableChartPieAggregate;
      return { ...base, ...extra };
    }
    return base;
  });
}

function layoutEquals(a: LayoutItem[], b: LayoutItem[]): boolean {
  if (a.length !== b.length) return false;
  const key = (item: LayoutItem) =>
    `${item.i}:${item.x},${item.y},${item.w},${item.h}:${item.tableId ?? ""}:${(item.columnKeys ?? []).join(",")}:${item.tableDisplayMode ?? ""}:${item.tableChartType ?? ""}:${item.tableChartCategoryColumnKey ?? ""}:${(item.tableChartValueColumnKeys ?? []).join(",")}:${item.tableChartPieAggregate ?? ""}`;
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
   * 更新布局。配置分为两类数据：
   * - 容器数据：x, y, w, h（位置、长宽）— 来自 react-grid-layout 的拖拽/缩放
   * - 信息数据：tableId, columnKeys 等 — 仅通过配置操作更新，拖拽/缩放不应覆盖
   * 合并时：容器数据用 newLayout；信息数据优先用 newLayout（来自 updateWidgetConfig），
   * 若 newLayout 未携带则保留 existing（来自拖拽/缩放时 react-grid-layout 不传这些字段）。
   */
  setLayout(newLayout: LayoutItem[]) {
    const merged = newLayout.map((newItem) => {
      const existing = this.layout.find((l) => l.i === newItem.i);
      if (!existing) return newItem;
      return {
        ...newItem,
        tableId: newItem.tableId ?? existing.tableId,
        columnKeys: newItem.columnKeys ?? existing.columnKeys,
        tableDisplayMode: newItem.tableDisplayMode ?? existing.tableDisplayMode,
        tableChartType: newItem.tableChartType ?? existing.tableChartType,
        tableChartCategoryColumnKey: newItem.tableChartCategoryColumnKey ?? existing.tableChartCategoryColumnKey,
        tableChartValueColumnKeys: newItem.tableChartValueColumnKeys ?? existing.tableChartValueColumnKeys,
        tableChartPieAggregate: newItem.tableChartPieAggregate ?? existing.tableChartPieAggregate,
      };
    });
    if (layoutEquals(this.layout, merged)) return;
    this.layout = merged;
  }

  addWidget(type: WidgetType, size: WidgetSize) {
    const id = nextWidgetId(this.layout, type);
    const { w, h } = SIZE_PRESETS[size];
    const y = getBottomY(this.layout);
    const newItem: LayoutItem = { i: id, x: 0, y, w, h };
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
    }
  ) {
    const next = this.layout.map((item) =>
      item.i === id ? { ...item, ...config } : item
    );
    this.setLayout(next);
  }
}

export const dashboardStore = new DashboardStore();
export { DEFAULT_LAYOUT };
