import { useState, useCallback, useRef } from "react";
import { getRoles, Role } from "@/lib/api/rbac";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { logger } from "@/lib/utils/logger";

interface UseRolesProps {
  initialRoles?: Role[];
  initialTotal?: number;
  onTotalChange: (total: number) => void;
  activeFilter: string;
}

/**
 * 管理角色数据获取和状态的 Hook
 */
export function useRoles({
  initialRoles,
  initialTotal,
  onTotalChange,
  activeFilter,
}: UseRolesProps) {
  const [roles, setRoles] = useState<Role[]>(initialRoles ?? []);
  const [loading, setLoading] = useState(initialRoles == null);
  const [error, setError] = useState<string>("");
  
  const loadingRolesRef = useRef(false);
  const { handleError } = useErrorHandler({ setError, showToast: false });

  const fetchRoles = useCallback(async (page: number) => {
    if (loadingRolesRef.current) return;
    try {
      loadingRolesRef.current = true;
      setLoading(true);
      const skip = (page - 1) * DEFAULT_PAGE_SIZE;
      const response = await getRoles({
        skip,
        limit: DEFAULT_PAGE_SIZE,
        is_active: activeFilter !== "all" ? activeFilter === "true" : undefined,
      });
      setRoles(response.items);
      onTotalChange(response.total);
    } catch (err) {
      handleError(err, "加载角色列表失败");
    } finally {
      setLoading(false);
      loadingRolesRef.current = false;
    }
  }, [activeFilter, onTotalChange, handleError]);

  return {
    roles,
    setRoles,
    loading,
    error,
    fetchRoles,
  };
}
