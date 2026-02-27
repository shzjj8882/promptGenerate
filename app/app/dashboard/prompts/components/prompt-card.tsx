"use client";

import { memo } from "react";
import { Shield, Building2, Bug, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSceneLabel } from "../utils/prompt-utils";
import type { Prompt, Tenant } from "../prompts-client";

interface PromptCardProps {
  prompt: Prompt;
  tenant: Tenant | undefined;
  isMounted: boolean;
  canUpdate: boolean;
  onEdit: (promptId: string) => void;
  onDebug: (prompt: Prompt) => void;
}

/**
 * 提示词卡片组件
 * 使用 React.memo 优化渲染性能
 */
export const PromptCard = memo(function PromptCard({
  prompt,
  tenant,
  isMounted,
  canUpdate,
  onEdit,
  onDebug,
}: PromptCardProps) {
  const sceneLabel = getSceneLabel(prompt.scene);

  return (
    <div
      className="group relative rounded-lg border-2 border-solid border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">{sceneLabel}</h3>
            <div className="flex items-center gap-2">
              {prompt.isDefault && (
                <Badge variant="outline" className="border-blue-300">
                  <Shield className="mr-1 h-3 w-3" />
                  默认
                </Badge>
              )}
              {!prompt.isDefault && (
                <Badge variant="secondary">
                  <Building2 className="mr-1 h-3 w-3" />
                  {tenant?.name || prompt.tenantId}
                </Badge>
              )}
            </div>
          </div>

          <div>
            <p className="line-clamp-3 text-sm text-muted-foreground">
              {prompt.content}
            </p>
          </div>

          {prompt.placeholders.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {prompt.placeholders.map((ph) => (
                <Badge key={ph} variant="secondary" className="text-xs">
                  {"{"}
                  {ph}
                  {"}"}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isMounted && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDebug(prompt)}
              title="占位符调试（仅转换占位符，不调用 LLM）"
            >
              <Bug className="mr-2 h-4 w-4" />
              调试
            </Button>
          )}
          {canUpdate && isMounted && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(prompt.id)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              编辑
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});
