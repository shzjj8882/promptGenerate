import { useCallback, useRef, useState } from "react";
import { getTenants, Tenant as ApiTenant } from "@/lib/api/tenants";
import { useErrorHandler } from "@/hooks/use-error-handler";
import type { Tenant } from "../prompts-client";

/**
 * 管理租户数据的 Hook
 */
export function useTenants(initialTenants?: Tenant[]) {
  const [tenants, setTenants] = useState<Tenant[]>(initialTenants ?? []);
  const [loadingTenants, setLoadingTenants] = useState(!initialTenants);
  const [tenantsError, setTenantsError] = useState<string | null>(null);
  
  const loadingTenantsRef = useRef(false);
  
  const { handleError: handleTenantsError } = useErrorHandler({ 
    setError: (error: string) => setTenantsError(error), 
    showToast: false 
  });

  const fetchTenants = useCallback(async () => {
    if (loadingTenantsRef.current) return;
    try {
      loadingTenantsRef.current = true;
      setLoadingTenants(true);
      setTenantsError(null);
      const response = await getTenants({
        skip: 0,
        limit: 1000,
        include_deleted: false,
      });
      
      const tenantList: Tenant[] = response.items
        .filter((tenant) => !tenant.is_deleted)
        .map((tenant: ApiTenant) => ({
          id: tenant.id,
          code_id: tenant.code_id,
          name: tenant.name,
        }));
      
      setTenants(tenantList);
    } catch (error) {
      handleTenantsError(error, "加载租户列表失败，请稍后重试");
      setTenants([]);
    } finally {
      setLoadingTenants(false);
      loadingTenantsRef.current = false;
    }
  }, [handleTenantsError]);

  return {
    tenants,
    loadingTenants,
    tenantsError,
    fetchTenants,
    setTenants,
  };
}
