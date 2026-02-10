import { useState, useCallback, useRef } from "react";
import { getPermissionsGrouped, Permission, PermissionsGroupedRawResponse, PermissionsGroupedResponse } from "@/lib/api/rbac";
import { logger } from "@/lib/utils/logger";
import { groupPermissionsByType } from "../utils/rbac-utils";

interface UsePermissionsProps {
  initialPermissionsGroupedRaw?: PermissionsGroupedRawResponse | null;
}

/**
 * 管理权限数据获取和状态的 Hook
 */
export function usePermissions({ initialPermissionsGroupedRaw }: UsePermissionsProps) {
  const [allPermissions, setAllPermissions] = useState<Permission[]>(
    initialPermissionsGroupedRaw?.items ?? []
  );
  const [permissionsGroupedForRole, setPermissionsGroupedForRole] = useState<PermissionsGroupedResponse | null>(
    initialPermissionsGroupedRaw != null ? groupPermissionsByType(initialPermissionsGroupedRaw) : null
  );
  
  const loadingPermissionsRef = useRef(false);

  const fetchPermissions = useCallback(async () => {
    if (loadingPermissionsRef.current) return;
    try {
      loadingPermissionsRef.current = true;
      const raw = await getPermissionsGrouped({ is_active: true });
      setPermissionsGroupedForRole(groupPermissionsByType(raw));
      setAllPermissions(raw.items);
    } catch (err) {
      logger.error("加载权限列表失败", err);
    } finally {
      loadingPermissionsRef.current = false;
    }
  }, []);

  return {
    allPermissions,
    setAllPermissions,
    permissionsGroupedForRole,
    setPermissionsGroupedForRole,
    fetchPermissions,
  };
}
