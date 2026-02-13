"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
        <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
        {description != null && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
