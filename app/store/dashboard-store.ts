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
    if ("tableId" in item && item.tableId) {
      return { ...base, tableId: item.tableId };
    }
    return base;
  });
}

function layoutEquals(a: LayoutItem[], b: LayoutItem[]): boolean {
  if (a.length !== b.length) return false;
  const key = (item: LayoutItem) =>
    `${item.i}:${item.x},${item.y},${item.w},${item.h}:${(item as LayoutItem & { tableId?: string }).tableId ?? ""}`;
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
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

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
      const items = res.layout?.length ? res.layout : DEFAULT_LAYOUT;
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

  private scheduleSave(newLayout: LayoutItem[]) {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const sanitized = sanitizeLayout(newLayout);
      saveDashboardConfig(sanitized)
        .then(() => setCachedLayout(sanitized))
        .catch((err) => {
          logger.error("保存工作台配置失败", err);
        });
    }, 500);
  }

  setLayout(newLayout: LayoutItem[]) {
    if (layoutEquals(this.layout, newLayout)) return;
    this.layout = newLayout;
    this.scheduleSave(newLayout);
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

  updateWidgetConfig(id: string, config: { tableId?: string }) {
    const next = this.layout.map((item) =>
      item.i === id ? { ...item, ...config } : item
    );
    this.setLayout(next);
  }
}

export const dashboardStore = new DashboardStore();
export { DEFAULT_LAYOUT };
