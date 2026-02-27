"use client";

import { useState, useEffect, useRef } from "react";
import { getTable, type MultiDimensionTable } from "@/lib/api/multi-dimension-tables";
import { logger } from "@/lib/utils/logger";
import type { Placeholder } from "../prompts-client";

/**
 * 加载占位符所需的表格信息
 * 用于 table 类型占位符的列选择等
 */
export function usePlaceholderTables(
  placeholders: Placeholder[],
  enabled: boolean
): {
  tableInfoMap: Record<string, MultiDimensionTable>;
  loadingTables: Record<string, boolean>;
} {
  const [tableInfoMap, setTableInfoMap] = useState<Record<string, MultiDimensionTable>>({});
  const [loadingTables, setLoadingTables] = useState<Record<string, boolean>>({});
  const loadedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const tableIds = [...new Set(placeholders.filter((p) => p.table_id).map((p) => p.table_id!))];
    if (tableIds.length === 0) return;

    const fetchTables = async () => {
      const toLoad = tableIds.filter((id) => !loadedIdsRef.current.has(id));
      if (toLoad.length === 0) return;

      const clearLoading: Record<string, boolean> = {};
      const newMap: Record<string, MultiDimensionTable> = {};

      for (const id of toLoad) {
        clearLoading[id] = true;
        try {
          const t = await getTable(id);
          if (t) newMap[id] = t;
        } catch {
          logger.warn(`加载表格 ${id} 失败`);
        } finally {
          clearLoading[id] = false;
        }
      }

      loadedIdsRef.current = new Set([...loadedIdsRef.current, ...toLoad]);
      setTableInfoMap((prev) => ({ ...prev, ...newMap }));
      setLoadingTables((prev) => ({ ...prev, ...clearLoading }));
    };

    fetchTables();
  }, [enabled, placeholders.filter((p) => p.table_id).map((p) => p.table_id).join(",")]);

  return { tableInfoMap, loadingTables };
}
