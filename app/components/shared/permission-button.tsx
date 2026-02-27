"use client";

import type { ReactNode } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { Button } from "@/components/ui/button";
import { useHasMenuButtonPermission } from "@/lib/permissions";

interface PermissionButtonProps
  extends Omit<ComponentPropsWithoutRef<typeof Button>, "children"> {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
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
