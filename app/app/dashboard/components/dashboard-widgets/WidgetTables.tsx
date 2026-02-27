"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { LayoutGrid, Settings2, BarChart3, Table2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MinusCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getTables, getTable, type MultiDimensionTable, type TableRow as TableRowType } from "@/lib/api/multi-dimension-tables";
import type { TableChartConfig } from "@/app/dashboard/tables/components/table-chart-view";

const TableChartView = dynamic(
  () => import("@/app/dashboard/tables/components/table-chart-view").then((m) => ({ default: m.TableChartView })),
  { ssr: false, loading: () => <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">加载图表...</div> }
);
import type { WidgetSize } from "./types";

export interface WidgetTablesConfig {
  tableId: string;
  columnKeys?: string[];
  displayMode?: "table" | "chart";
  chartType?: "bar" | "pie" | "line";
  chartCategoryColumnKey?: string;
  chartValueColumnKeys?: string[];
  chartPieAggregate?: "sum" | "count";
}

interface WidgetTablesProps {
  size: WidgetSize;
  widgetId: string;
  tableId?: string;
  columnKeys?: string[];
  tableDisplayMode?: "table" | "chart";
  tableChartType?: "bar" | "pie" | "line";
  tableChartCategoryColumnKey?: string;
  tableChartValueColumnKeys?: string[];
  tableChartPieAggregate?: "sum" | "count";
  onRemove?: (id: string) => void;
  onUpdateTable?: (widgetId: string, config: WidgetTablesConfig) => void;
}

export function WidgetTables({
  size,
  widgetId,
  tableId,
  columnKeys = [],
  tableDisplayMode = "table",
  tableChartType = "bar",
  tableChartCategoryColumnKey = "",
  tableChartValueColumnKeys = [],
  tableChartPieAggregate = "sum",
  onRemove,
  onUpdateTable,
}: WidgetTablesProps) {
  const [configOpen, setConfigOpen] = useState(false);
  const [tables, setTables] = useState<MultiDimensionTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string>(tableId ?? "");
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<string[]>(columnKeys);
  const [displayMode, setDisplayMode] = useState<"table" | "chart">(tableDisplayMode);
  const [chartType, setChartType] = useState<"bar" | "pie" | "line">(tableChartType);
  const [chartCategoryKey, setChartCategoryKey] = useState(tableChartCategoryColumnKey);
  const [chartValueKeys, setChartValueKeys] = useState<string[]>(tableChartValueColumnKeys);
  const [chartPieAggregate, setChartPieAggregate] = useState<"sum" | "count">(tableChartPieAggregate);
  const [tableMeta, setTableMeta] = useState<MultiDimensionTable | null>(null);
  const [table, setTable] = useState<MultiDimensionTable | null>(null);
  const [loading, setLoading] = useState(false);

  const canConfig = !!onUpdateTable;
  const prevConfigOpen = useRef(false);

  const fetchTables = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getTables({ limit: 100 });
      setTables(res.items);
    } catch {
      setTables([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (configOpen && !prevConfigOpen.current) {
      prevConfigOpen.current = true;
      fetchTables();
      setSelectedTableId(tableId ?? "");
      setSelectedColumnKeys(Array.isArray(columnKeys) && columnKeys.length > 0 ? [...columnKeys] : []);
      setDisplayMode(tableDisplayMode);
      setChartType(tableChartType);
      setChartCategoryKey(tableChartCategoryColumnKey ?? "");
      setChartValueKeys(tableChartValueColumnKeys ?? []);
      setChartPieAggregate(tableChartPieAggregate ?? "sum");
    }
    if (!configOpen) prevConfigOpen.current = false;
  }, [configOpen, tableId, columnKeys, tableDisplayMode, tableChartType, tableChartCategoryColumnKey, tableChartValueColumnKeys, tableChartPieAggregate, fetchTables]);

  useEffect(() => {
    if (configOpen && selectedTableId) {
      getTable(selectedTableId)
        .then((t) => {
          setTableMeta(t);
          if (!t.columns?.length) return;
          setSelectedColumnKeys((prev) => {
            const validKeys = t.columns.map((c) => c.key);
            const filtered = prev.filter((k) => validKeys.includes(k));
            if (filtered.length > 0) return filtered;
            return validKeys;
          });
        })
        .catch(() => setTableMeta(null));
    } else {
      setTableMeta(null);
    }
  }, [configOpen, selectedTableId]);

  useEffect(() => {
    if (tableId) {
      getTable(tableId, true)
        .then(setTable)
        .catch(() => setTable(null));
    } else {
      setTable(null);
    }
  }, [tableId]);

  const handleToggleColumn = (key: string) => {
    setSelectedColumnKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSelectAllColumns = (checked: boolean) => {
    if (!tableMeta?.columns) return;
    setSelectedColumnKeys(checked ? tableMeta.columns.map((c) => c.key) : []);
  };

  const handleConfirmConfig = () => {
    if (selectedTableId && onUpdateTable) {
      onUpdateTable(widgetId, {
        tableId: selectedTableId,
        columnKeys: selectedColumnKeys,
        displayMode,
        chartType,
        chartCategoryColumnKey: chartCategoryKey,
        chartValueColumnKeys: chartValueKeys,
        chartPieAggregate,
      });
      setConfigOpen(false);
    }
  };

  const chartConfig: TableChartConfig = {
    chartType,
    categoryColumnKey: chartCategoryKey,
    valueColumnKeys: chartValueKeys,
    pieAggregate: chartPieAggregate,
  };
  const chartableColumns = tableMeta?.columns?.filter((c) =>
    ["text", "number", "single_select", "multi_select"].includes(c.type || "text")
  ) ?? [];
  const numericColumns = tableMeta?.columns?.filter((c) => (c.type || "text") === "number") ?? [];
  const hasValidChartConfig =
    chartCategoryKey &&
    (displayMode !== "chart" || chartType !== "pie" || chartPieAggregate === "count" || chartValueKeys.length >= 1);

  const displayColumns = table?.columns?.length
    ? columnKeys.length > 0
      ? table.columns.filter((c) => columnKeys.includes(c.key))
      : table.columns
    : [];
  const rows = table?.rows ?? [];

  return (
    <>
      <Card className="h-full flex flex-col py-0">
        <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">
              {table ? table.name : "多维表格"}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {!canConfig && table && (
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                <Link href={`/dashboard/tables/${table.id}`}>进入管理 →</Link>
              </Button>
            )}
            {canConfig && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => setConfigOpen(true)}
                title="配置表格"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            )}
            {onRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => onRemove(widgetId)}
              >
                <MinusCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 px-4 pb-4 pt-0 min-h-0 flex flex-col">
          {table ? (
            displayMode === "chart" ? (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <TableChartView
                  table={table}
                  rows={rows as TableRowType[]}
                  config={chartConfig}
                  onConfigChange={() => {}}
                  compact
                  className="h-full"
                />
              </div>
            ) : (
              <>
              <div className="flex-1 min-h-0 overflow-auto border rounded-md">
                {displayColumns.length > 0 && rows.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-12 text-xs">#</TableHead>
                        {displayColumns.map((col) => (
                          <TableHead key={col.key} className="text-xs">
                            {col.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, size === "small" ? 5 : size === "medium" ? 10 : 20).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs text-muted-foreground py-1.5">
                            {row.row_id}
                          </TableCell>
                          {displayColumns.map((col) => (
                            <TableCell key={col.key} className="text-xs py-1.5 max-w-[120px] truncate">
                              {row.cells?.[col.key] ?? "-"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {displayColumns.length === 0
                      ? "请配置要展示的列"
                      : "暂无数据"}
                  </div>
                )}
              </div>
            </>
            )
          ) : canConfig ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">请选择要展示的表格并配置列</p>
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => setConfigOpen(true)}
              >
                <Settings2 className="h-3 w-3 mr-1" />
                选择表格
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">请先配置要展示的表格</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>配置多维表格</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-2">
            <div>
              <p className="text-sm font-medium mb-2">展示模式</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={displayMode === "table" ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setDisplayMode("table")}
                >
                  <Table2 className="h-4 w-4" />
                  表格
                </Button>
                <Button
                  type="button"
                  variant={displayMode === "chart" ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setDisplayMode("chart")}
                >
                  <BarChart3 className="h-4 w-4" />
                  图表
                </Button>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">选择表格</p>
              {loading ? (
                <p className="text-sm text-muted-foreground">加载中...</p>
              ) : tables.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无表格，请先创建</p>
              ) : (
                <Select
                  value={selectedTableId || undefined}
                  onValueChange={(v) => setSelectedTableId(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="请选择表格" />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {tableMeta && tableMeta.columns?.length > 0 && displayMode === "table" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">展示列（可取消勾选隐藏）</p>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <Checkbox
                      checked={
                        selectedColumnKeys.length === tableMeta.columns.length
                      }
                      onCheckedChange={(c) =>
                        handleSelectAllColumns(c === true)
                      }
                    />
                    全选
                  </label>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-2">
                  {tableMeta.columns.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1"
                    >
                      <Checkbox
                        checked={selectedColumnKeys.includes(col.key)}
                        onCheckedChange={() => handleToggleColumn(col.key)}
                      />
                      <span className="text-sm">
                        {col.label}
                        <span className="text-muted-foreground ml-1">({col.key})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {tableMeta && tableMeta.columns?.length > 0 && displayMode === "chart" && (
              <>
                <div>
                  <p className="text-sm font-medium mb-2">图表类型</p>
                  <Select value={chartType} onValueChange={(v: "bar" | "pie" | "line") => setChartType(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bar">柱状图</SelectItem>
                      <SelectItem value="line">折线图</SelectItem>
                      <SelectItem value="pie">饼状图</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {chartType === "pie" && (
                  <div>
                    <p className="text-sm font-medium mb-2">聚合方式</p>
                    <Select value={chartPieAggregate} onValueChange={(v: "sum" | "count") => setChartPieAggregate(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sum">求和</SelectItem>
                        <SelectItem value="count">计数</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium mb-2">分类列</p>
                  <Select value={chartCategoryKey || "_none"} onValueChange={(v) => setChartCategoryKey(v === "_none" ? "" : v)}>
                    <SelectTrigger className="w-full">
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
                {(chartType !== "pie" || chartPieAggregate === "sum") && numericColumns.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">数值列</p>
                    <div className="max-h-32 overflow-y-auto space-y-2 border rounded-md p-2">
                      {numericColumns.map((col) => (
                        <label key={col.key} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                          <Checkbox
                            checked={chartValueKeys.includes(col.key)}
                            onCheckedChange={(checked) => {
                              setChartValueKeys((prev) =>
                                checked ? [...prev, col.key] : prev.filter((k) => k !== col.key)
                              );
                            }}
                          />
                          <span className="text-sm">{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleConfirmConfig}
              disabled={
                !selectedTableId ||
                (displayMode === "table" && tableMeta?.columns?.length ? selectedColumnKeys.length === 0 : false) ||
                (displayMode === "chart" && (!chartCategoryKey || ((chartType !== "pie" || chartPieAggregate === "sum") && chartValueKeys.length === 0)))
              }
            >
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
