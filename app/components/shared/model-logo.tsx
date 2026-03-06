"use client";

import { getModelLogoUrl } from "@/lib/utils/model-logo";
import { cn } from "@/lib/utils";

interface ModelLogoProps {
  provider: string;
  model?: string;
  name?: string;
  size?: number;
  className?: string;
  /** 是否显示名称（用于表格单元格） */
  showName?: boolean;
}

/**
 * 模型 Logo 组件
 * 从本地 public/model-logos/ 加载提供商 logo，无匹配时显示首字母
 */
export function ModelLogo({
  provider,
  model,
  name,
  size = 24,
  className,
  showName = false,
}: ModelLogoProps) {
  const logoUrl = getModelLogoUrl(provider, model);
  const fallbackLetter = (name || provider || "?")[0].toUpperCase();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
        style={{ width: size, height: size }}
      >
        {logoUrl && (
          <img
            src={logoUrl}
            alt={provider}
            className="h-full w-full object-contain p-0.5"
            style={{ width: size, height: size }}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
              const fallback = target.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.classList.remove("hidden");
            }}
          />
        )}
        <span
          className={cn(
            "flex items-center justify-center font-medium text-muted-foreground",
            logoUrl && "absolute inset-0 hidden"
          )}
          style={{ fontSize: size * 0.5 }}
        >
          {fallbackLetter}
        </span>
      </div>
      {showName && name && <span className="truncate">{name}</span>}
    </div>
  );
}
