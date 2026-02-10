"use client";

import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useHasMenuButtonPermission } from "@/lib/permissions";

interface PermissionButtonProps {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
  [key: string]: any; // 允许传递其他 Button 组件的 props
}

/**
 * 权限按钮组件
 * 自动检查权限，无权限时隐藏或显示 fallback
 */
export function PermissionButton({
  permission,
  children,
  fallback = null,
  ...buttonProps
}: PermissionButtonProps) {
  const hasPermission = useHasMenuButtonPermission(permission);

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <Button {...buttonProps}>{children}</Button>;
}
