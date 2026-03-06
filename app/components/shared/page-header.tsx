"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TYPOGRAPHY } from "@/lib/design-tokens";

export type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 shrink-0 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div>
        <h2 className={TYPOGRAPHY.pageTitle}>{title}</h2>
        {description != null && (
          <p className={cn(TYPOGRAPHY.pageSubtitle, "mt-1")}>{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
