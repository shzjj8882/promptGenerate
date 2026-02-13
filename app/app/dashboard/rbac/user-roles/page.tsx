import { Metadata } from "next";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { getCurrentUserOnServer } from "@/lib/server-api/auth";
import { getRolesOnServer } from "@/lib/server-api/rbac";
import { getUsersOnServer, getUserRolesBatchOnServer } from "@/lib/server-api/users";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { isServerApiError } from "@/lib/server-api/errors";

// 动态导入用户权限分配客户端组件
const UserRolesClient = dynamic(() => import("./user-roles-client").then((mod) => ({ default: mod.UserRolesClient })), {
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-center text-muted-foreground">加载中...</div>
    </div>
  ),
});

export const metadata: Metadata = {
  title: "用户权限分配 - PromptHub",
};

const ALL_ROLES_LIMIT = 1000;

export default async function UserRolesPage() {
  const user = await getCurrentUserOnServer();
  // 系统超级管理员和团队管理员都可以访问用户权限分配
  if (!user.is_superuser && !user.is_team_admin) {
    redirect("/403");
  }

  try {
    const [usersRes, allRolesRes] = await Promise.all([
      getUsersOnServer({ skip: 0, limit: DEFAULT_PAGE_SIZE }),
      getRolesOnServer({ skip: 0, limit: ALL_ROLES_LIMIT }),
    ]);

    const userIds = usersRes.items.map((u) => u.id);
    const initialUserRoleIdsMap = userIds.length > 0
      ? await getUserRolesBatchOnServer(userIds)
      : {};

    return (
      <UserRolesClient
        initialUsers={usersRes.items}
        initialUsersTotal={usersRes.total}
        initialUsersPage={1}
        initialUserRoleIdsMap={initialUserRoleIdsMap}
        initialAllRoles={allRolesRes.items}
      />
    );
  } catch (e) {
    if (isServerApiError(e)) {
      if (e.status === 401) redirect("/login");
      if (e.status === 403) redirect("/403");
    }
    return <UserRolesClient />;
  }
}
