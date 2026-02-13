import { Metadata } from "next";
import { TenantsClient } from "./tenants-client";
import { getTenantsOnServer } from "@/lib/server-api/tenants";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "租户管理 - PromptHub",
};

export default async function TenantsPage() {
  try {
    const { items, total } = await getTenantsOnServer({ skip: 0, limit: DEFAULT_PAGE_SIZE });
    return (
      <TenantsClient
        initialTenants={items}
        initialTotal={total}
        initialPage={1}
      />
    );
  } catch {
    // 若服务端获取失败，仍然渲染客户端组件由其自行拉取，避免整页崩溃
    return <TenantsClient />;
  }
}

