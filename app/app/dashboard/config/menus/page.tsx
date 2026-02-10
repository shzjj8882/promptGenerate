import { Metadata } from "next";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { getCurrentUserOnServer } from "@/lib/server-api/auth";
import { MenusConfigClient } from "./menus-config-client";

const MenusConfigClientDynamic = dynamic(() => import("./menus-config-client").then((mod) => ({ default: mod.MenusConfigClient })), {
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-center text-muted-foreground">加载中...</div>
    </div>
  ),
  ssr: false,
});

export const metadata: Metadata = {
  title: "菜单配置 - AILY",
};

export default async function MenusConfigPage() {
  const user = await getCurrentUserOnServer();
  // 系统超级管理员和团队管理员都可以访问菜单配置
  if (!user.is_superuser && !user.is_team_admin) {
    redirect("/403");
  }

  return <MenusConfigClientDynamic />;
}
