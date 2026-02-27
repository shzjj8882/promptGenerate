"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { Column, Line, Pie } from "@ant-design/charts";
import { uiStore } from "@/store/ui-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BarChart3, PieChart as PieChartIcon, LineChart as LineChartIcon, Settings2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import type { MultiDimensionTable, TableRow as TableRowType } from "@/lib/api/multi-dimension-tables";
import { cn } from "@/lib/utils";

/** 默认图表配色（与 globals.css 的 --chart-* 一致，用于 SSR 或变量未解析时） */
const CHART_COLORS_LIGHT = [
  "oklch(0.646 0.222 41.116)",
  "oklch(0.6 0.118 184.704)",
  "oklch(0.398 0.07 227.392)",
  "oklch(0.828 0.189 84.429)",
  "oklch(0.769 0.188 70.08)",
];
const CHART_COLORS_DARK = [
  "oklch(0.488 0.243 264.376)",
  "oklch(0.696 0.17 162.48)",
  "oklch(0.769 0.188 70.08)",
  "oklch(0.627 0.265 303.9)",
  "oklch(0.645 0.246 16.439)",
];

function useChartColors() {
  const [colors, setColors] = useState<string[]>(CHART_COLORS_LIGHT);

  useEffect(() => {
    const readColors = () => {
      if (typeof document === "undefined") return;
      const root = document.documentElement;
      const style = getComputedStyle(root);
      const resolved = [1, 2, 3, 4, 5].map((i) =>
        style.getPropertyValue(`--chart-${i}`).trim()
      );
      const valid = resolved.every((c) => c.length > 0);
      if (valid) {
        setColors(resolved);
      } else {
        setColors(
          root.classList.contains("dark") ? CHART_COLORS_DARK : CHART_COLORS_LIGHT
        );
      }
    };

    readColors();
    const obs = new MutationObserver(readColors);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  return colors;
}

export type ChartType = "bar" | "pie" | "line";

export interface TableChartConfig {
  chartType: ChartType;
  categoryColumnKey: string; // X 轴 / 分类
  valueColumnKeys: string[]; // Y 轴 / 数值列
  pieAggregate?: "sum" | "count"; // 饼图聚合方式：求和 或 计数
}

interface TableChartViewProps {
  table: MultiDimensionTable;
  rows: TableRowType[];
  config: TableChartConfig;
  onConfigChange: (config: TableChartConfig) => void;
  className?: string;
  /** 紧凑模式：隐藏配置栏，仅展示图表（用于工作台卡片） */
  compact?: boolean;
}

function parseNumber(value: string): number {
  if (value === "" || value == null) return 0;
  const n = parseFloat(String(value).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

/** 将 chartData 转为 AntV 多系列格式：[{ name, type, value }, ...] */
function toAntVSeriesData(
  chartData: Record<string, string | number>[],
  valueColumnKeys: string[],
  table: MultiDimensionTable
): { name: string; type: string; value: number }[] {
  const result: { name: string; type: string; value: number }[] = [];
  for (const row of chartData) {
    const name = String(row.name ?? "");
    for (const key of valueColumnKeys) {
      const col = table.columns.find((c) => c.key === key);
      const type = col?.label ?? key;
      const val = row[type];
      result.push({
        name,
        type,
        value: typeof val === "number" ? val : parseNumber(String(val ?? 0)),
      });
    }
  }
  return result;
}

/** 容器尺寸变化时强制图表重新绘制的 key（侧边栏展开/收起会改变容器大小） */
function useChartResizeKey(compact: boolean, hasChart: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizeKey, setResizeKey] = useState(0);
  const sidebarOpen = uiStore.dashboardConfigSidebarOpen;

  useEffect(() => {
    if (!hasChart) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setResizeKey((k) => k + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasChart]);

  const chartKey = compact ? `${resizeKey}-${sidebarOpen}` : String(resizeKey);
  return { chartKey, containerRef };
}

function TableChartViewImpl({
  table,
  rows,
  config,
  onConfigChange,
  className,
  compact = false,
}: TableChartViewProps) {
  const chartColors = useChartColors();
  const numericColumns = useMemo(
    () => table.columns.filter((c) => (c.type || "text") === "number"),
    [table.columns]
  );
  const chartableColumns = useMemo(
    () => table.columns.filter((c) => ["text", "number", "single_select", "multi_select"].includes(c.type || "text")),
    [table.columns]
  );

  const chartData = useMemo(() => {
    if (!config.categoryColumnKey || config.valueColumnKeys.length === 0) return [];

    const categoryCol = table.columns.find((c) => c.key === config.categoryColumnKey);
    const valueCols = table.columns.filter((c) => config.valueColumnKeys.includes(c.key));

    if (!categoryCol || valueCols.length === 0) return [];

    const grouped = new Map<string, Record<string, string | number>>();

    for (const row of rows) {
      const catVal = row.cells[config.categoryColumnKey] ?? "";
      const key = String(catVal || "(空)");

      if (!grouped.has(key)) {
        grouped.set(key, { name: key });
      }
      const entry = grouped.get(key)!;
      for (const col of valueCols) {
        const v = parseNumber(row.cells[col.key] ?? "0");
        const prev = entry[col.label];
        entry[col.label] = (typeof prev === "number" ? prev : 0) + v;
      }
    }

    return Array.from(grouped.values());
  }, [rows, config, table.columns]);

  const antVBarLineData = useMemo(
    () => toAntVSeriesData(chartData, config.valueColumnKeys, table),
    [chartData, config.valueColumnKeys, table]
  );

  const pieData = useMemo(() => {
    if (config.chartType !== "pie" || !config.categoryColumnKey) return [];

    const aggregateMode = config.pieAggregate ?? "sum";
    const aggregated = new Map<string, number>();

    if (aggregateMode === "count") {
      for (const row of rows) {
        const catVal = row.cells[config.categoryColumnKey] ?? "";
        const key = String(catVal || "(空)");
        aggregated.set(key, (aggregated.get(key) ?? 0) + 1);
      }
    } else {
      if (config.valueColumnKeys.length === 0) return [];
      const valueKey = config.valueColumnKeys[0];
      for (const row of rows) {
        const catVal = row.cells[config.categoryColumnKey] ?? "";
        const key = String(catVal || "(空)");
        const v = parseNumber(row.cells[valueKey] ?? "0");
        aggregated.set(key, (aggregated.get(key) ?? 0) + v);
      }
    }

    return Array.from(aggregated.entries()).map(([name, value], i) => ({
      name,
      value,
      fill: chartColors[i % chartColors.length],
    }));
  }, [rows, config, table.columns, chartColors]);

  const hasValidConfig =
    config.categoryColumnKey &&
    (config.chartType === "pie"
      ? config.pieAggregate === "count" || config.valueColumnKeys.length >= 1
      : config.valueColumnKeys.length >= 1);

  const { chartKey, containerRef } = useChartResizeKey(compact, Boolean(hasValidConfig));
  const colorPalette = chartColors;

  return (
    <div className={cn("flex flex-col h-full min-h-0 overflow-hidden", className)}>
      {/* 图表配置栏（紧凑模式下隐藏） */}
      {!compact && (
      <div className="flex items-center gap-4 p-3 border-b bg-muted/50 shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm shrink-0">图表类型</Label>
          <Select
            value={config.chartType}
            onValueChange={(v: ChartType) => onConfigChange({ ...config, chartType: v })}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bar">
                <span className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  柱状图
                </span>
              </SelectItem>
              <SelectItem value="line">
                <span className="flex items-center gap-2">
                  <LineChartIcon className="h-4 w-4" />
                  折线图
                </span>
              </SelectItem>
              <SelectItem value="pie">
                <span className="flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4" />
                  饼状图
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {config.chartType === "pie" && (
          <div className="flex items-center gap-2">
            <Label className="text-sm shrink-0">聚合方式</Label>
            <Select
              value={config.pieAggregate ?? "sum"}
              onValueChange={(v: "sum" | "count") =>
                onConfigChange({ ...config, pieAggregate: v })
              }
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sum">求和</SelectItem>
                <SelectItem value="count">计数</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Label className="text-sm shrink-0">分类列</Label>
          <Select
            value={config.categoryColumnKey || "_none"}
            onValueChange={(v) =>
              onConfigChange({ ...config, categoryColumnKey: v === "_none" ? "" : v })
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="选择分类列" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">-- 选择分类列 --</SelectItem>
              {chartableColumns.map((col) => (
                <SelectItem key={col.key} value={col.key}>
                  {col.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings2 className="h-4 w-4" />
                数值列 ({config.valueColumnKeys.length})
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="start">
              <div className="space-y-2">
                <Label className="text-sm">参与图表的数值列</Label>
                {numericColumns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">无数字类型列</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {numericColumns.map((col) => (
                      <div key={col.key} className="flex items-center gap-2">
                        <Checkbox
                          id={`chart-val-${col.key}`}
                          checked={config.valueColumnKeys.includes(col.key)}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...config.valueColumnKeys, col.key]
                              : config.valueColumnKeys.filter((k) => k !== col.key);
                            onConfigChange({ ...config, valueColumnKeys: next });
                          }}
                        />
                        <Label
                          htmlFor={`chart-val-${col.key}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {col.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      )}

      {/* 图表区域 */}
      <div className={cn("flex-1 min-h-0 p-4 flex flex-col overflow-hidden", !compact && "min-h-[300px]")}>
        {!hasValidConfig ? (
          <div className="flex-1 min-h-0 flex items-center justify-center text-muted-foreground border border-dashed rounded-lg">
            {config.chartType === "pie" && config.pieAggregate === "count"
              ? "请选择分类列"
              : "请选择分类列和至少一个数值列"}
          </div>
        ) : config.chartType === "pie" ? (
          <div ref={containerRef} className="flex-1 min-h-0 w-full min-w-0 h-full overflow-hidden" style={{ minHeight: compact ? 180 : 250 }}>
            <Pie
              key={chartKey}
              data={pieData}
              angleField="value"
              colorField="name"
              color={pieData.map((d) => d.fill)}
              radius={compact ? 0.7 : 0.75}
              innerRadius={compact ? 0.4 : 0.5}
              label={{
                type: "outer",
                content: (datum: { name: string; percent?: number }) =>
                  `${datum.name} ${((datum.percent ?? 0) * 100).toFixed(0)}%`,
              }}
              legend={{
                position: "bottom",
                layout: "horizontal",
              }}
              tooltip={{
                title: (d: { name: string }) => d.name,
                items: [(d: { name: string; value: number }) => ({ name: "数值", value: d.value })],
              }}
              padding={[8, 8, 24, 8]}
              autoFit
            />
          </div>
        ) : config.chartType === "line" ? (
          <div ref={containerRef} className="flex-1 min-h-0 w-full min-w-0 h-full overflow-hidden" style={{ minHeight: compact ? 180 : 250 }}>
            <Line
              key={chartKey}
              data={antVBarLineData}
              xField="name"
              yField="value"
              seriesField="type"
              color={colorPalette}
              legend={{ position: "top" }}
              padding={[24, 8, 8, 8]}
              axis={{
                x: { title: false },
                y: { title: false },
              }}
              tooltip={{
                items: [(d: { name: string; type: string; value: number }) => ({ name: d.type, value: d.value })],
              }}
              autoFit
            />
          </div>
        ) : (
          <div ref={containerRef} className="flex-1 min-h-0 w-full min-w-0 h-full overflow-hidden" style={{ minHeight: compact ? 180 : 250 }}>
            <Column
              key={chartKey}
              data={antVBarLineData}
              xField="name"
              yField="value"
              seriesField="type"
              group
              color={colorPalette}
              legend={{ position: "top" }}
              padding={[24, 8, 8, 8]}
              axis={{
                x: { title: false },
                y: { title: false },
              }}
              tooltip={{
                items: [(d: { name: string; type: string; value: number }) => ({ name: d.type, value: d.value })],
              }}
              autoFit
            />
          </div>
        )}
      </div>
    </div>
  );
}

export const TableChartView = observer(TableChartViewImpl);
