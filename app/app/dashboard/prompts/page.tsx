import { Metadata } from "next";
import dynamic from "next/dynamic";
import { getTenantsOnServer } from "@/lib/server-api/tenants";
import { getPromptsOnServer } from "@/lib/server-api/prompts";
import type { Prompt as ApiPrompt } from "@/lib/api/prompts";
import type { Prompt, PromptScene, Tenant } from "./prompts-client";

// 动态导入大型组件，减少初始包大小
const PromptsClient = dynamic(() => import("./prompts-client").then((mod) => ({ default: mod.PromptsClient })), {
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-center text-muted-foreground">加载中...</div>
    </div>
  ),
});

export const metadata: Metadata = {
  title: "提示词管理 - AILY",
};

export default async function PromptsPage() {
  try {
    // 默认首屏：场景为 all，租户为 default => is_default = true
    const [tenantsResponse, promptResponse] = await Promise.all([
      getTenantsOnServer({ skip: 0, limit: 1000, include_deleted: false }),
      getPromptsOnServer({ is_default: true }),
    ]);

    const initialTenants: Tenant[] = tenantsResponse.items
      .filter((tenant) => !tenant.is_deleted)
      .map((tenant) => ({
        id: tenant.id,
        code_id: tenant.code_id,
        name: tenant.name,
      }));

    const initialPrompts: Prompt[] = (promptResponse as ApiPrompt[]).map((p) => ({
      id: p.id,
      scene: p.scene as PromptScene,
      tenantId: p.tenant_id === "default" ? "default" : p.tenant_id,
      content: p.content,
      placeholders: p.placeholders ?? [],
      isDefault: p.is_default,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

    return (
      <PromptsClient
        initialTenants={initialTenants}
        initialPrompts={initialPrompts}
      />
    );
  } catch {
    // SSR 失败时退回到纯客户端加载
    return <PromptsClient />;
  }
}

