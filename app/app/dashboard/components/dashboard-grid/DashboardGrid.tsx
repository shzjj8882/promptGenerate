"use client";

import { useCallback, useMemo } from "react";
import { WidthProvider, ReactGridLayout } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import {
  WidgetTables,
  WidgetPrompts,
  WidgetTeamCode,
  parseWidgetType,
} from "../dashboard-widgets";
import type { WidgetSize } from "../dashboard-widgets";
import type { LayoutItem } from "@/lib/api/dashboard-config";
import { SIZE_PRESETS } from "../dashboard-widgets/types";

const GridLayoutWithWidth = WidthProvider(ReactGridLayout);

const DROPPING_ITEM_ID = "__dropping__";

/** 默认布局（新用户无配置时使用） */
const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "tables-1", x: 0, y: 0, w: 6, h: 3 },
  { i: "prompts-1", x: 6, y: 0, w: 6, h: 3 },
  { i: "team_code-1", x: 0, y: 3, w: 12, h: 4 },
];

function inferSizeFromLayout(item: LayoutItem): WidgetSize {
  const { w, h } = item;
  if (w >= 12 && h >= 4) return "large";
  if (w >= 6 && h >= 3) return "medium";
  return "small";
}

interface DashboardGridProps {
  layout: LayoutItem[];
  onLayoutChange: (layout: LayoutItem[]) => void;
  onRemove: (id: string) => void;
  /** 更新多维表格组件的配置（含表格/图表模式） */
  onUpdateTableConfig?: (widgetId: string, config: import("../dashboard-widgets/WidgetTables").WidgetTablesConfig) => void;
  /** 更新团队 Code 组件的配置（展示模式 + 统计卡片 + 图表类型） */
  onUpdateTeamCodeConfig?: (
    widgetId: string,
    config: {
      teamCodeDisplayMode: "authcode" | "usage" | "chart";
      teamCodeUsageCard?: "package" | "extra" | "rollover";
      teamCodeChartType?: "line" | "pie";
    }
  ) => void;
  loading?: boolean;
  /** 是否处于配置中（配置中可拖拽、缩放、删除，非配置中仅展示） */
  isConfiguring?: boolean;
  /** 从侧边栏拖入完成时的回调 */
  onDrop?: (layout: readonly LayoutItem[], item: LayoutItem | undefined, e: Event) => void;
  /** 是否临时锁定拖拽（例如某个子组件打开弹窗时） */
  dragLocked?: boolean;
}

export function DashboardGrid({
  layout,
  onLayoutChange,
  onRemove,
  onUpdateTableConfig,
  onUpdateTeamCodeConfig,
  loading = false,
  isConfiguring = false,
  onDrop,
  dragLocked = false,
}: DashboardGridProps) {
  const droppingItem = useMemo(
    () => ({
      i: DROPPING_ITEM_ID,
      w: SIZE_PRESETS.medium.w,
      h: SIZE_PRESETS.medium.h,
      x: 0,
      y: 0,
    }),
    []
  );

  /** 非配置模式下，为每个布局项设置 static: true，禁止拖拽和缩放 */
  const effectiveLayout = useMemo(
    () =>
      isConfiguring
        ? layout
        : layout.map((item) => ({ ...item, static: true })),
    [layout, isConfiguring]
  );

  const applyLayout = useCallback(
    (newLayout: readonly LayoutItem[]) => {
      if (!isConfiguring) return;
      const filtered = newLayout.filter((item) => item.i !== DROPPING_ITEM_ID);
      onLayoutChange([...filtered]);
    },
    [onLayoutChange, isConfiguring]
  );

  const handleDragStop = useCallback(
    (layout: readonly LayoutItem[], _oldItem: LayoutItem | null, _newItem: LayoutItem | null, _placeholder: LayoutItem | null, _e: Event, _el?: HTMLElement) => applyLayout(layout),
    [applyLayout]
  );

  const handleResizeStop = useCallback(
    (layout: readonly LayoutItem[], _oldItem: LayoutItem | null, _newItem: LayoutItem | null, _placeholder: LayoutItem | null, _e: Event, _el?: HTMLElement) => applyLayout(layout),
    [applyLayout]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
        加载中...
      </div>
    );
  }

  return (
    <GridLayoutWithWidth
      key={isConfiguring ? "config" : "view"}
      className="layout"
      style={{ minHeight: 400 }}
      layout={effectiveLayout}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      cols={12}
      rowHeight={60}
      margin={[16, 16]}
      containerPadding={[0, 0]}
      isDraggable={isConfiguring && !dragLocked}
      isResizable={isConfiguring && !dragLocked}
      isDroppable={isConfiguring && !dragLocked}
      droppingItem={droppingItem}
      onDrop={onDrop}
      compactType="vertical"
      preventCollision={false}
    >
      {effectiveLayout.map((item) => {
        const type = parseWidgetType(item.i);
        const size = inferSizeFromLayout(item);
        const common = { size, widgetId: item.i, onRemove: isConfiguring ? onRemove : undefined };

        if (type === "tables") {
          return (
            <div key={item.i} className="min-h-0 h-full">
              <WidgetTables
                {...common}
                tableId={item.tableId}
                columnKeys={item.columnKeys}
                tableDisplayMode={item.tableDisplayMode}
                tableChartType={item.tableChartType}
                tableChartCategoryColumnKey={item.tableChartCategoryColumnKey}
                tableChartValueColumnKeys={item.tableChartValueColumnKeys}
                tableChartPieAggregate={item.tableChartPieAggregate}
                tableColumnWidths={(item as any).tableColumnWidths}
                allowConfig={isConfiguring}
                onUpdateTable={onUpdateTableConfig}
              />
            </div>
          );
        }
        if (type === "prompts") {
          return (
            <div key={item.i} className="min-h-0">
              <WidgetPrompts {...common} />
            </div>
          );
        }
        if (type === "team_code") {
          return (
            <div key={item.i} className="min-h-0 h-full">
              <WidgetTeamCode
                {...common}
                teamCodeDisplayMode={(item as any).teamCodeDisplayMode ?? "authcode"}
                teamCodeUsageCard={(item as any).teamCodeUsageCard ?? "package"}
                teamCodeChartType={(item as any).teamCodeChartType ?? "line"}
                onUpdateConfig={onUpdateTeamCodeConfig}
                allowConfig={isConfiguring}
              />
            </div>
          );
        }
        return null;
      })}
    </GridLayoutWithWidth>
  );
}

export { SIZE_PRESETS, DEFAULT_LAYOUT };
