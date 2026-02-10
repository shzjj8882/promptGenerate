"use client";

import { memo } from "react";
import { Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ActionButtons } from "@/components/shared/action-buttons";
import type { Role } from "@/lib/api/rbac";

interface RoleCardProps {
  role: Role;
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
  onToggleActive?: (role: Role) => void;
  isToggling?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

/**
 * 角色卡片组件
 * 使用 React.memo 优化性能，避免不必要的重新渲染
 */
export const RoleCard = memo(function RoleCard({
  role,
  onEdit,
  onDelete,
  onToggleActive,
  isToggling = false,
  canEdit = true,
  canDelete = true,
}: RoleCardProps) {
  return (
    <div className="group relative rounded-lg border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md flex flex-col w-[280px] h-[300px]">
      <div className="flex flex-col items-start gap-3 flex-1 mb-4">
        {/* 头部：图标、名称、代码 */}
        <div className="flex items-center gap-2 w-full">
          <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground truncate">
              {role.name}
            </h3>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground truncate">
              {role.code}
            </p>
          </div>
        </div>

        {/* 描述（如果有） */}
        {role.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 break-words w-full">
            {role.description}
          </p>
        )}

        {/* 权限列表 */}
        <div className="w-full">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">权限</div>
          <div className="flex flex-wrap gap-1">
            {role.permissions.length > 0 ? (
              <>
                {role.permissions.slice(0, 3).map((p) => (
                  <Badge key={p.id} variant="outline" className="text-xs font-normal">
                    {p.name}
                  </Badge>
                ))}
                {role.permissions.length > 3 && (
                  <Badge variant="outline" className="text-xs font-normal">
                    +{role.permissions.length - 3}
                  </Badge>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">暂无权限</span>
            )}
          </div>
        </div>
      </div>

      {/* 底部：状态切换和操作按钮 */}
      <div className="flex items-center justify-between gap-2 pt-3 mt-auto border-t">
        {onToggleActive && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Switch
              checked={role.is_active}
              onCheckedChange={() => onToggleActive(role)}
              disabled={isToggling}
              className="scale-90"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {role.is_active ? "已激活" : "未激活"}
            </span>
          </div>
        )}
        <ActionButtons
          onEdit={() => onEdit(role)}
          onDelete={() => onDelete(role)}
          canEdit={canEdit}
          canDelete={canDelete}
          variant="inline"
          size="sm"
        />
      </div>
    </div>
  );
});
