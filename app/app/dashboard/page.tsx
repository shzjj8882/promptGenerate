"use client";

import { useEffect, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { DashboardGrid } from "./components/dashboard-grid/DashboardGrid";
import { dashboardStore, nextWidgetId } from "@/store/dashboard-store";
import { uiStore } from "@/store/ui-store";
import type { LayoutItem } from "@/lib/api/dashboard-config";
import { DRAG_DATA_KEY } from "./components/dashboard-widgets/types";

function DashboardPageImpl() {
  useEffect(() => {
    dashboardStore.loadConfig();
  }, []);

  const handleLayoutChange = useCallback((layout: LayoutItem[]) => {
    dashboardStore.setLayout(layout);
  }, []);

  const handleUpdateTableConfig = useCallback((widgetId: string, tableId: string) => {
    dashboardStore.updateWidgetConfig(widgetId, { tableId });
  }, []);

  const handleDrop = useCallback(
    (layout: readonly LayoutItem[], item: LayoutItem | undefined, e: Event) => {
      const data = (e as DragEvent).dataTransfer?.getData(DRAG_DATA_KEY);
      if (!data || !item) return;
      try {
        const { type } = JSON.parse(data);
        const newId = nextWidgetId([...layout], type);
        const newLayout = layout.map((l) =>
          l.i === item.i ? { ...l, i: newId } : l
        );
        dashboardStore.setLayout(newLayout);
      } catch {
        // 忽略无效拖拽数据
      }
    },
    []
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0">
        <DashboardGrid
          layout={dashboardStore.layout}
          onLayoutChange={handleLayoutChange}
          onRemove={(id) => dashboardStore.removeWidget(id)}
          onUpdateTableConfig={handleUpdateTableConfig}
          loading={dashboardStore.loading}
          isConfiguring={uiStore.dashboardConfigMode}
          onDrop={handleDrop}
        />
      </div>
    </div>
  );
}

const DashboardPage = observer(DashboardPageImpl);

export default DashboardPage;
