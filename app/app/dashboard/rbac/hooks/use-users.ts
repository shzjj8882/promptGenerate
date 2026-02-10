import { useState, useCallback, useRef } from "react";
import { getUsers, getUserRolesBatch } from "@/lib/api/users";
import { getRoles, Role } from "@/lib/api/rbac";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { logger } from "@/lib/utils/logger";
import type { User } from "@/lib/api/users";

interface UseUsersProps {
  initialUsers?: User[];
  initialUserRoleIdsMap?: Record<string, string[]>;
  initialAllRoles?: Role[];
  usersActiveFilter: string;
  setUsersTotal: (total: number) => void;
  setUserRoleError?: (msg: string) => void;
}

/**
 * 管理用户列表、用户角色映射及全量角色（用于用户角色分配）的 Hook
 */
export function useUsers({
  initialUsers,
  initialUserRoleIdsMap,
  initialAllRoles,
  usersActiveFilter,
  setUsersTotal,
  setUserRoleError,
}: UseUsersProps) {
  const [users, setUsers] = useState<User[]>(initialUsers ?? []);
  const [usersLoading, setUsersLoading] = useState(initialUsers == null);
  const [userRoleIdsMap, setUserRoleIdsMap] = useState<Record<string, string[]>>(
    initialUserRoleIdsMap ?? {}
  );
  const [allRolesForUser, setAllRolesForUser] = useState<Role[]>(initialAllRoles ?? []);

  const loadingUsersRef = useRef(false);
  const loadingAllRolesRef = useRef(false);
  const { handleError } = useErrorHandler({
    setError: setUserRoleError ?? (() => {}),
    showToast: false,
  });

  const fetchUsers = useCallback(
    async (page: number) => {
      if (loadingUsersRef.current) return;
      try {
        loadingUsersRef.current = true;
        setUsersLoading(true);
        const skip = (page - 1) * DEFAULT_PAGE_SIZE;
        const response = await getUsers({
          skip,
          limit: DEFAULT_PAGE_SIZE,
          is_active:
            usersActiveFilter !== "all" ? usersActiveFilter === "true" : undefined,
        });
        setUsers(response.items);
        setUsersTotal(response.total);
        const userIds = response.items.map((u) => u.id);
        const nextMap =
          userIds.length > 0
            ? await getUserRolesBatch(userIds).catch(
                () => ({} as Record<string, string[]>)
              )
            : {};
        setUserRoleIdsMap((prev) => ({ ...prev, ...nextMap }));
      } catch (err) {
        handleError(err, "加载用户列表失败");
      } finally {
        setUsersLoading(false);
        loadingUsersRef.current = false;
      }
    },
    [usersActiveFilter, setUsersTotal, handleError]
  );

  const fetchAllRoles = useCallback(async () => {
    if (loadingAllRolesRef.current) return;
    try {
      loadingAllRolesRef.current = true;
      const response = await getRoles({ skip: 0, limit: 1000 });
      setAllRolesForUser(response.items);
    } catch (err) {
      logger.error("加载角色列表失败", err);
    } finally {
      loadingAllRolesRef.current = false;
    }
  }, []);

  return {
    users,
    setUsers,
    usersLoading,
    userRoleIdsMap,
    setUserRoleIdsMap,
    allRolesForUser,
    setAllRolesForUser,
    fetchUsers,
    fetchAllRoles,
  };
}
