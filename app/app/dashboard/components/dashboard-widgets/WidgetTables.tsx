"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LayoutGrid, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MinusCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getTables, getTable, type MultiDimensionTable } from "@/lib/api/multi-dimension-tables";
import type { WidgetSize } from "./types";

interface WidgetTablesProps {
  size: WidgetSize;
  widgetId: string;
  tableId?: string;
  onRemove?: (id: string) => void;
  onUpdateTable?: (widgetId: string, tableId: string) => void;
}

export function WidgetTables({
  size,
  widgetId,
  tableId,
  onRemove,
  onUpdateTable,
}: WidgetTablesProps) {
  const [configOpen, setConfigOpen] = useState(false);
  const [tables, setTables] = useState<MultiDimensionTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string>(tableId ?? "");
  const [table, setTable] = useState<MultiDimensionTable | null>(null);
  const [loading, setLoading] = useState(false);

  const canConfig = !!onUpdateTable;

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
    if (configOpen) {
      fetchTables();
      setSelectedTableId(tableId ?? "");
    }
  }, [configOpen, tableId, fetchTables]);

  useEffect(() => {
    if (tableId) {
      getTable(tableId)
        .then(setTable)
        .catch(() => setTable(null));
    } else {
      setTable(null);
    }
  }, [tableId]);

  const handleConfirmConfig = () => {
    if (selectedTableId && onUpdateTable) {
      onUpdateTable(widgetId, selectedTableId);
      setConfigOpen(false);
    }
  };

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
        <CardContent className="flex-1 px-4 pb-4 pt-0">
          {table ? (
            <>
              <p className="text-xs text-muted-foreground">
                {size === "small" && table.description}
                {size === "medium" && (table.description || "管理多维表格配置和数据，支持多维度分析")}
                {size === "large" &&
                  (table.description ||
                    "管理多维表格配置和数据，支持多维度分析和数据导入导出")}
              </p>
              <Button variant="link" size="sm" className="h-auto p-0 mt-2 text-xs" asChild>
                <Link href={`/dashboard/tables/${table.id}`}>进入管理 →</Link>
              </Button>
            </>
          ) : canConfig ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">请选择要展示的表格</p>
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
            <p className="text-xs text-muted-foreground">
              {size === "small" && "管理多维表格配置和数据"}
              {size === "medium" && "管理多维表格配置和数据，支持多维度分析"}
              {size === "large" &&
                "管理多维表格配置和数据，支持多维度分析和数据导入导出"}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>选择表格</DialogTitle>
          </DialogHeader>
          <div className="max-h-60 overflow-y-auto space-y-1 py-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">加载中...</p>
            ) : tables.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无表格，请先创建</p>
            ) : (
              tables.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTableId(t.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedTableId === t.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {t.name}
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>
              取消
            </Button>
            <Button onClick={handleConfirmConfig} disabled={!selectedTableId}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
