import { Metadata } from "next";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { getCurrentUserOnServer } from "@/lib/server-api/auth";
import { getRolesOnServer, getPermissionsGroupedOnServer } from "@/lib/server-api/rbac";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { isServerApiError } from "@/lib/server-api/errors";

// 动态导入角色管理客户端组件
const RolesClient = dynamic(() => import("./roles-client").then((mod) => ({ default: mod.RolesClient })), {
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-center text-muted-foreground">加载中...</div>
    </div>
  ),
});

export const metadata: Metadata = {
  title: "角色管理 - AILY",
};

export default async function RolesPage() {
  const user = await getCurrentUserOnServer();
  // 系统超级管理员和团队管理员都可以访问角色管理
  if (!user.is_superuser && !user.is_team_admin) {
    redirect("/403");
  }

  try {
    const [rolesRes, permissionsRaw] = await Promise.all([
      getRolesOnServer({ skip: 0, limit: DEFAULT_PAGE_SIZE }),
      getPermissionsGroupedOnServer({ is_active: true }),
    ]);

    return (
      <RolesClient
        initialRoles={rolesRes.items}
        initialRolesTotal={rolesRes.total}
        initialRolesPage={1}
        initialPermissionsGroupedRaw={permissionsRaw}
      />
    );
  } catch (e) {
    if (isServerApiError(e)) {
      if (e.status === 401) redirect("/login");
      if (e.status === 403) redirect("/403");
    }
    return <RolesClient />;
  }
}
