import { useState, useCallback, useRef } from "react";
import { getTables, MultiDimensionTable } from "@/lib/api/multi-dimension-tables";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { useErrorHandler } from "@/hooks/use-error-handler";

interface UseTablesProps {
  initialTables?: MultiDimensionTable[];
  initialTotal?: number;
  onTotalChange: (total: number) => void;
}

/**
 * 管理多维表格数据获取和状态的 Hook
 */
export function useTables({ initialTables, initialTotal, onTotalChange }: UseTablesProps) {
  const [tables, setTables] = useState<MultiDimensionTable[]>(initialTables ?? []);
  const [loading, setLoading] = useState(!initialTables);
  const [error, setError] = useState<string>("");
  
  const loadingTablesRef = useRef(false);
  const { handleError } = useErrorHandler({ setError, showToast: false });

  const fetchTables = useCallback(async (page: number) => {
    if (loadingTablesRef.current) return;
    
    // 验证 page 参数
    if (!Number.isFinite(page) || page < 1) {
      console.warn("Invalid page number:", page);
      return;
    }
    
    try {
      loadingTablesRef.current = true;
      setLoading(true);
      const calculatedSkip = (page - 1) * DEFAULT_PAGE_SIZE;
      
      // 确保 calculatedSkip 是有效数字
      if (!Number.isFinite(calculatedSkip) || calculatedSkip < 0) {
        console.warn("Invalid skip value:", calculatedSkip);
        return;
      }
      
      const response = await getTables({ skip: calculatedSkip, limit: DEFAULT_PAGE_SIZE });
      setTables(response.items);
      onTotalChange(response.total);
    } catch (err) {
      handleError(err, "加载表格列表失败");
    } finally {
      setLoading(false);
      loadingTablesRef.current = false;
    }
  }, [onTotalChange, handleError]);

  return {
    tables,
    setTables,
    loading,
    error,
    fetchTables,
  };
}
