"use client";

import { memo } from "react";
import { Shield, Building2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSceneLabel } from "../utils/prompt-utils";
import type { PromptScene, Tenant } from "../prompts-client";

interface MissingPromptCardProps {
  scene: PromptScene;
  tenantId: string | "default";
  tenant: Tenant | null;
  isMounted: boolean;
  canCreate: boolean;
  onEdit: (scene: PromptScene, tenantId: string | "default") => void;
}

/**
 * 缺失提示词卡片组件
 * 显示未定义的提示词占位卡片
 */
export const MissingPromptCard = memo(function MissingPromptCard({
  scene,
  tenantId,
  tenant,
  isMounted,
  canCreate,
  onEdit,
}: MissingPromptCardProps) {
  const sceneLabel = getSceneLabel(scene);

  return (
    <div
      key={`missing-${scene}-${tenantId}`}
      className="group relative rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-muted-foreground">{sceneLabel}</h3>
            <div className="flex items-center gap-2">
              {tenantId === "default" ? (
                <Badge variant="outline" className="border-blue-300">
                  <Shield className="mr-1 h-3 w-3" />
                  默认
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <Building2 className="mr-1 h-3 w-3" />
                  {tenant?.name || tenantId}
                </Badge>
              )}
              <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
                未定义
              </Badge>
            </div>
          </div>

          <div>
            <p className="line-clamp-3 text-sm italic text-muted-foreground">
              暂无默认提示词
            </p>
          </div>
        </div>

        {canCreate && isMounted && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(scene, tenantId)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            编辑
          </Button>
        )}
      </div>
    </div>
  );
});
