"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, ArrowDown, HelpCircle } from "@/components/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface UsageStatCardProps {
  title: string;
  value: string | number | React.ReactNode;
  /** 右上角徽章内容，如 "+12.5%" 或 "本月" */
  badge?: string;
  /** 右上角操作区（如设置按钮），与 badge 可同时存在 */
  action?: React.ReactNode;
  /** 数值区域字号：default 大号，compact 紧凑（适合日期区间） */
  valueSize?: "default" | "compact";
  /** 徽章趋势：正数显示上升，负数显示下降 */
  badgeTrend?: "up" | "down" | "neutral";
  /** 底部趋势描述 */
  trendText?: string;
  /** 底部补充说明（更小字号、灰色） */
  contextText?: string;
  /** hover ? 展示的补充说明 */
  contextHelp?: string;
  /** 无边框 */
  borderless?: boolean;
  /** 与 CardHeader 一致的 padding/对齐（用于工作台与其他卡片统一） */
  matchHeaderLayout?: boolean;
  className?: string;
}

export function UsageStatCard({
  title,
  value,
  badge,
  action,
  badgeTrend = "neutral",
  trendText,
  contextText,
  contextHelp,
  valueSize = "default",
  borderless,
  matchHeaderLayout,
  className,
}: UsageStatCardProps) {
  const headerCls = matchHeaderLayout ? "items-center" : "items-start";
  const contentCls = matchHeaderLayout ? "px-4 pt-3 pb-3" : "p-3";
  return (
    <Card className={cn("min-h-[120px] flex flex-col", matchHeaderLayout ? "min-w-[100px]" : "min-w-0", !borderless && "shadow-sm border-border/60", borderless && "border-0 shadow-none", matchHeaderLayout && "py-0", className)}>
      <CardContent className={cn("flex flex-col flex-1 min-h-0", contentCls)}>
        <div className={cn("flex justify-between gap-2 shrink-0", headerCls)}>
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <div className="flex items-center gap-1 shrink-0">
          {badge && (
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 text-[11px] font-medium border-muted-foreground/30 bg-muted/30",
                badgeTrend === "up" && "text-emerald-600 dark:text-emerald-400",
                badgeTrend === "down" && "text-rose-600 dark:text-rose-400"
              )}
            >
              {badgeTrend === "up" && <TrendingUp className="mr-1 h-3 w-3" />}
              {badgeTrend === "down" && <ArrowDown className="mr-1 h-3 w-3" />}
              {badge}
            </Badge>
          )}
          {action}
          </div>
        </div>
        <div
          className={cn(
            "mt-2 flex items-end min-h-[2.25rem] font-bold tracking-tight text-foreground tabular-nums",
            valueSize === "compact" ? "text-base leading-snug" : "text-2xl"
          )}
        >
          {value}
        </div>
        <div className="mt-auto pt-2 space-y-0.5">
          {trendText && (
            <div className="text-sm text-foreground">{trendText}</div>
          )}
          {contextText && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {contextText}
              {contextHelp && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-help text-muted-foreground hover:text-foreground">
                      <HelpCircle className="size-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {contextHelp}
                  </TooltipContent>
                </Tooltip>
              )}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
