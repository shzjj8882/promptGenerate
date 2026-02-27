/**
 * 按条件查询表格行的业务逻辑 Hook
 * 分离查询、CURL 生成等业务逻辑，便于组件只负责 UI
 */

import { useState, useEffect, useCallback } from "react";
import { queryTableRowsByConditions } from "@/lib/api/multi-dimension-tables";
import { buildCurlCommand, getCurlBaseUrl } from "@/lib/utils/curl";
import type {
  MultiDimensionTable,
  TableRow,
  TableRowQueryCondition,
} from "@/lib/api/multi-dimension-tables";

export interface UseRowQueryOptions {
  table: MultiDimensionTable | null;
  open: boolean;
}

export function useRowQuery({ table, open }: UseRowQueryOptions) {
  const [conditions, setConditions] = useState<TableRowQueryCondition[]>([
    { column_key: "", operator: "equals", value: "" },
  ]);
  const [logic, setLogic] = useState<"and" | "or">("and");
  const [limitOne, setLimitOne] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ rows: TableRow[]; total: number } | null>(
    null
  );
  const [copiedCurl, setCopiedCurl] = useState(false);

  const columns = table?.columns ?? [];
  const conditionOptions = [
    { key: "row_id", label: "行号 (row_id)" },
    ...columns.map((c) => ({ key: c.key, label: c.label })),
  ];

  useEffect(() => {
    if (open) {
      setConditions([
        {
          column_key: columns[0]?.key ?? "row_id",
          operator: "equals",
          value: "",
        },
      ]);
      setLogic("and");
      setLimitOne(false);
      setResult(null);
    }
  }, [open, columns]);

  const addCondition = useCallback(() => {
    setConditions((prev) => [
      ...prev,
      {
        column_key: columns[0]?.key ?? "row_id",
        operator: "equals",
        value: "",
      },
    ]);
  }, [columns]);

  const removeCondition = useCallback((index: number) => {
    setConditions((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const updateCondition = useCallback(
    (index: number, field: keyof TableRowQueryCondition, value: string) => {
      setConditions((prev) =>
        prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
      );
    },
    []
  );

  const getValidConditions = useCallback(() => {
    return conditions.filter(
      (c) => c.column_key.trim() && (c.value ?? "").toString().trim()
    );
  }, [conditions]);

  const handleQuery = useCallback(async () => {
    if (!table?.id) return;
    const validConditions = getValidConditions();
    if (validConditions.length === 0) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await queryTableRowsByConditions(table.id, {
        conditions: validConditions.map((c) => ({
          column_key: c.column_key,
          operator: c.operator ?? "equals",
          value: String(c.value).trim(),
        })),
        logic,
        limit: limitOne ? 1 : undefined,
      });
      setResult({ rows: res.rows, total: res.total });
    } catch {
      setResult({ rows: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [table?.id, getValidConditions, logic, limitOne]);

  const getCurlCommand = useCallback((): string | null => {
    if (!table?.id) return null;
    const validConditions = getValidConditions();
    if (validConditions.length === 0) return null;

    const baseUrl = getCurlBaseUrl();
    const url = `${baseUrl}/admin/multi-dimension-tables/${table.id}/rows/query-by-conditions`;
    return buildCurlCommand({
      method: "POST",
      url,
      body: {
        conditions: validConditions.map((c) => ({
          column_key: c.column_key,
          operator: c.operator ?? "equals",
          value: String(c.value).trim(),
        })),
        logic,
        limit: limitOne ? 1 : undefined,
      },
    });
  }, [table?.id, getValidConditions, logic, limitOne]);

  const handleCopyCurl = useCallback(async () => {
    const cmd = getCurlCommand();
    if (!cmd) return;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    } catch {
      // ignore
    }
  }, [getCurlCommand]);

  return {
    conditions,
    logic,
    limitOne,
    setLogic,
    setLimitOne,
    addCondition,
    removeCondition,
    updateCondition,
    conditionOptions,
    loading,
    result,
    copiedCurl,
    handleQuery,
    handleCopyCurl,
    getValidConditions,
  };
}
