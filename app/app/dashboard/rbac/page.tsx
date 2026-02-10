import { redirect } from "next/navigation";
import { getCurrentUserOnServer } from "@/lib/server-api/auth";

/**
 * 权限管理主页面 - 重定向到角色管理页面
 * 权限管理已拆分为三个子菜单：
 * - /dashboard/rbac/roles - 角色管理
 * - /dashboard/rbac/user-roles - 用户权限分配
 * - /dashboard/rbac/menus - 菜单管理
 */
export default async function RBACPage() {
  const user = await getCurrentUserOnServer();
  // 系统超级管理员和团队管理员都可以访问权限管理
  if (!user.is_superuser && !user.is_team_admin) {
    redirect("/403");
  }

  // 重定向到角色管理页面（默认页面）
  redirect("/dashboard/rbac/roles");
}
