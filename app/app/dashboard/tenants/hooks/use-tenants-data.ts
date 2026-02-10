import { useState, useCallback, useRef } from "react";
import { getTenants, Tenant } from "@/lib/api/tenants";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { useErrorHandler } from "@/hooks/use-error-handler";

interface UseTenantsDataProps {
  initialTenants?: Tenant[];
  initialTotal?: number;
  onTotalChange: (total: number) => void;
}

/**
 * 管理租户数据获取和状态的 Hook
 */
export function useTenantsData({ initialTenants, initialTotal, onTotalChange }: UseTenantsDataProps) {
  const [tenants, setTenants] = useState<Tenant[]>(initialTenants ?? []);
  const [loading, setLoading] = useState(!initialTenants);
  const [error, setError] = useState<string>("");
  
  const loadingTenantsRef = useRef(false);
  const { handleError } = useErrorHandler({ setError, showToast: false });

  const fetchTenants = useCallback(async (page: number) => {
    if (loadingTenantsRef.current) return;
    try {
      loadingTenantsRef.current = true;
      setLoading(true);
      const skip = (page - 1) * DEFAULT_PAGE_SIZE;
      const response = await getTenants({ skip, limit: DEFAULT_PAGE_SIZE });
      setTenants(response.items);
      onTotalChange(response.total);
    } catch (err) {
      handleError(err, "加载租户列表失败");
    } finally {
      setLoading(false);
      loadingTenantsRef.current = false;
    }
  }, [onTotalChange, handleError]);

  return {
    tenants,
    setTenants,
    loading,
    error,
    fetchTenants,
  };
}
