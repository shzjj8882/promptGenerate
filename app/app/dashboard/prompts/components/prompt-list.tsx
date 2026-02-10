"use client";

import { memo, useMemo } from "react";
import { PromptCard } from "./prompt-card";
import { MissingPromptCard } from "./missing-prompt-card";
import type { PromptScene, Prompt, Scene, Tenant } from "../prompts-client";

interface PromptListProps {
  loadingPrompts: boolean;
  filteredPrompts: Prompt[];
  missingPrompts: Array<{
    scene: PromptScene;
    tenantId: string | "default";
    tenant: Tenant | null;
  }>;
  tenants: Tenant[];
  isMounted: boolean;
  canUpdate: boolean;
  canCreate: boolean;
  onEditById: (promptId: string) => void;
  onEdit: (scene: PromptScene, tenantId: string | "default") => void;
  onDebug: (prompt: Prompt) => void;
}

/**
 * 提示词列表组件
 * 包含已存在的提示词卡片和缺失的提示词卡片
 */
export const PromptList = memo(function PromptList({
  loadingPrompts,
  filteredPrompts,
  missingPrompts,
  tenants,
  isMounted,
  canUpdate,
  canCreate,
  onEditById,
  onEdit,
  onDebug,
}: PromptListProps) {
  // 创建租户 Map 以优化查找性能
  const tenantMap = useMemo(() => {
    const map = new Map<string, Tenant>();
    tenants.forEach((tenant) => {
      map.set(tenant.id, tenant);
    });
    return map;
  }, [tenants]);

  if (loadingPrompts) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* 已存在的提示词卡片 */}
      {filteredPrompts.map((prompt) => {
        const tenant = tenantMap.get(prompt.tenantId);
        return (
          <PromptCard
            key={prompt.id}
            prompt={prompt}
            tenant={tenant}
            isMounted={isMounted}
            canUpdate={canUpdate}
            onEdit={onEditById}
            onDebug={onDebug}
          />
        );
      })}

      {/* 缺失的提示词卡片 */}
      {missingPrompts.map(({ scene, tenantId, tenant }) => (
        <MissingPromptCard
          key={`missing-${scene}-${tenantId}`}
          scene={scene}
          tenantId={tenantId}
          tenant={tenant}
          isMounted={isMounted}
          canCreate={canCreate}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
});
