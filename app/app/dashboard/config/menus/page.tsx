import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserOnServer } from "@/lib/server-api/auth";
import { MenusConfigDynamic } from "./menus-config-dynamic";

export const metadata: Metadata = {
  title: "菜单配置 - PromptHub",
};

export default async function MenusConfigPage() {
  const user = await getCurrentUserOnServer();
  // 系统超级管理员和团队管理员都可以访问菜单配置
  if (!user.is_superuser && !user.is_team_admin) {
    redirect("/403");
  }

  return <MenusConfigDynamic />;
}
