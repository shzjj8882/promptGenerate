import { Metadata } from "next";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { getCurrentUserOnServer } from "@/lib/server-api/auth";

// 动态导入菜单管理客户端组件
const MenusClient = dynamic(() => import("./menus-client").then((mod) => ({ default: mod.MenusClient })), {
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-center text-muted-foreground">加载中...</div>
    </div>
  ),
});

export const metadata: Metadata = {
  title: "菜单管理 - PromptHub",
};

export default async function MenusPage() {
  const user = await getCurrentUserOnServer();
  // 系统超级管理员和团队管理员都可以访问菜单管理
  if (!user.is_superuser && !user.is_team_admin) {
    redirect("/403");
  }

  return <MenusClient />;
}
