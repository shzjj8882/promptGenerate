"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Copy, Check, Key, RotateCcw, MinusCircle, BarChart3, Settings2, LineChartIcon, PieChartIcon, History } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { uiStore } from "@/store/ui-store";
import {
  resetMyTeamAuthcode,
  getMyTeam,
  getMyTeamUsageDaily,
  getMyTeamUsageByBusiness,
} from "@/lib/api/teams";
import { userStore } from "@/store/user-store";
import { MENU_BUTTON_PERMISSIONS, useHasMenuButtonPermission } from "@/lib/permissions";
import { logger } from "@/lib/utils/logger";
import { getCurrentUser } from "@/lib/api/auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UsageStatCard } from "@/app/dashboard/teams/components/usage-stat-card";
import { UsageLogsDialog } from "@/app/dashboard/teams/components/usage-logs-dialog";
import type { WidgetSize } from "./types";

export type TeamCodeDisplayMode = "authcode" | "usage" | "chart";
export type TeamCodeChartType = "line" | "pie";
export type TeamCodeUsageCard = "package" | "extra" | "rollover";

const USAGE_CARD_OPTIONS: { value: TeamCodeUsageCard; label: string }[] = [
  { value: "package", label: "套餐状态" },
  { value: "extra", label: "套餐外额度" },
  { value: "rollover", label: "上月结余" },
];

const CHART_TYPE_OPTIONS: { value: TeamCodeChartType; label: string }[] = [
  { value: "line", label: "折线图（近7日用量）" },
  { value: "pie", label: "饼图（按业务）" },
];

/** 默认图表配色（浅色，与 globals.css :root --chart-* 一致） */
const CHART_COLORS_LIGHT = [
  "oklch(0.646 0.222 41.116)",
  "oklch(0.6 0.118 184.704)",
  "oklch(0.398 0.07 227.392)",
  "oklch(0.828 0.189 84.429)",
  "oklch(0.769 0.188 70.08)",
];
/** 深色模式图表配色（与 globals.css .dark --chart-* 一致） */
const CHART_COLORS_DARK = [
  "oklch(0.488 0.243 264.376)",
  "oklch(0.696 0.17 162.48)",
  "oklch(0.769 0.188 70.08)",
  "oklch(0.627 0.265 303.9)",
  "oklch(0.645 0.246 16.439)",
];

function useChartColors() {
  const [colors, setColors] = useState<string[]>(CHART_COLORS_LIGHT);
  useEffect(() => {
    const readColors = () => {
      if (typeof document === "undefined") return;
      const root = document.documentElement;
      const style = getComputedStyle(root);
      const resolved = [1, 2, 3, 4, 5].map((i) =>
        style.getPropertyValue(`--chart-${i}`).trim()
      );
      const valid = resolved.every((c) => c.length > 0);
      if (valid) setColors(resolved);
      else setColors(root.classList.contains("dark") ? CHART_COLORS_DARK : CHART_COLORS_LIGHT);
    };
    readColors();
    const obs = new MutationObserver(readColors);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return colors;
}

/** 用量为整数，格式化显示（不含小数） */
function formatUsage(value: number): string {
  return Math.round(value).toLocaleString();
}

interface WidgetTeamCodeProps {
  size: WidgetSize;
  widgetId: string;
  /** 展示模式：认证码 | 使用量统计 | 图表 */
  teamCodeDisplayMode?: TeamCodeDisplayMode;
  /** 使用量模式下展示的卡片（默认套餐状态） */
  teamCodeUsageCard?: TeamCodeUsageCard;
  /** 图表模式下展示的图表类型 */
  teamCodeChartType?: TeamCodeChartType;
  onRemove?: (id: string) => void;
  /** 更新配置（配置模式下） */
  onUpdateConfig?: (
    widgetId: string,
    config: {
      teamCodeDisplayMode: TeamCodeDisplayMode;
      teamCodeUsageCard?: TeamCodeUsageCard;
      teamCodeChartType?: TeamCodeChartType;
    }
  ) => void;
  /** 是否允许配置 */
  allowConfig?: boolean;
}

function WidgetTeamCodeImpl({
  size,
  widgetId,
  teamCodeDisplayMode = "authcode",
  teamCodeUsageCard = "package",
  teamCodeChartType = "line",
  onRemove,
  onUpdateConfig,
  allowConfig = false,
}: WidgetTeamCodeProps) {
  const [copied, setCopied] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [configDisplayMode, setConfigDisplayMode] = useState<TeamCodeDisplayMode>(teamCodeDisplayMode);
  const [configUsageCard, setConfigUsageCard] = useState<TeamCodeUsageCard>(teamCodeUsageCard);
  const [configChartType, setConfigChartType] = useState<TeamCodeChartType>(teamCodeChartType);
  const prevConfigOpen = useRef(false);
  const [teamUsage, setTeamUsage] = useState<{
    tokens_used: number;
    token_limit: number | null;
    year_month: string;
    breakdown?: {
      base_token_limit: number;
      gift_tokens: number;
      extra_tokens: number;
      rollover_from_prev_tokens: number;
      tokens_used: number;
      gift_tokens_used: number;
      rollover_tokens_used: number;
      base_tokens_used: number;
      extra_tokens_used: number;
    };
  } | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [dailyItems, setDailyItems] = useState<{ date: string; tokens_used: number }[]>([]);
  const [byBusinessItems, setByBusinessItems] = useState<{ business_name: string; tokens_used: number }[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartResizeKey, setChartResizeKey] = useState(0);
  const chartColors = useChartColors();

  /** 容器尺寸变化时强制图表重新绘制（侧边栏收起/展开会改变卡片宽度） */
  useEffect(() => {
    if (teamCodeDisplayMode !== "chart") return;
    const el = chartContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setChartResizeKey((k) => k + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [teamCodeDisplayMode]);

  const chartKey = `${chartResizeKey}-${uiStore.dashboardConfigSidebarOpen}`;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (configOpen && !prevConfigOpen.current) {
      prevConfigOpen.current = true;
      setConfigDisplayMode(teamCodeDisplayMode);
      setConfigUsageCard(teamCodeUsageCard);
      setConfigChartType(teamCodeChartType);
    }
    if (!configOpen) prevConfigOpen.current = false;
  }, [configOpen, teamCodeDisplayMode, teamCodeUsageCard, teamCodeChartType]);

  useEffect(() => {
    uiStore.setDashboardDragLocked(configOpen);
    return () => {
      uiStore.setDashboardDragLocked(false);
    };
  }, [configOpen]);

  useEffect(() => {
    if (teamCodeDisplayMode === "usage" && mounted) {
      setUsageLoading(true);
      getMyTeam()
        .then((res) => {
          setTeamUsage({
            tokens_used: res.current_month_tokens_used ?? 0,
            token_limit: res.current_month_token_limit ?? null,
            year_month: res.current_month_year_month ?? "",
            breakdown: res.current_month_breakdown,
          });
        })
        .catch(() => setTeamUsage(null))
        .finally(() => setUsageLoading(false));
    }
  }, [teamCodeDisplayMode, mounted]);

  useEffect(() => {
    if (teamCodeDisplayMode === "chart" && mounted) {
      setChartLoading(true);
      const now = new Date();
      const ym = now.toISOString().slice(0, 7);
      if (teamCodeChartType === "line") {
        const end = new Date(now);
        const start = new Date(now);
        start.setDate(start.getDate() - 6);
        const start_date = start.toISOString().slice(0, 10);
        const end_date = end.toISOString().slice(0, 10);
        getMyTeamUsageDaily({ start_date, end_date })
          .then((res) => setDailyItems(res.items ?? []))
          .catch(() => setDailyItems([]))
          .finally(() => setChartLoading(false));
      } else {
        getMyTeamUsageByBusiness({ year_month: ym })
          .then((res) => setByBusinessItems(res.items ?? []))
          .catch(() => setByBusinessItems([]))
          .finally(() => setChartLoading(false));
      }
    }
  }, [teamCodeDisplayMode, teamCodeChartType, mounted]);

  const teamAuthcode = userStore.user?.team_authcode;
  const teamCode = userStore.user?.team_code;

  const handleCopyAuthcode = useCallback(async () => {
    if (!teamAuthcode) return;
    try {
      await navigator.clipboard.writeText(teamAuthcode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error("复制失败", err);
    }
  }, [teamAuthcode]);

  const handleResetAuthcode = useCallback(async () => {
    setResetting(true);
    try {
      await resetMyTeamAuthcode();
      const userInfo = await getCurrentUser();
      userStore.setUser(userInfo);
      setResetDialogOpen(false);
      logger.info("认证码重置成功");
    } catch (err) {
      logger.error("重置认证码失败", err);
    } finally {
      setResetting(false);
    }
  }, []);

  const authcode = mounted ? teamAuthcode : null;
  const teamName = mounted && teamCode ? `团队: ${teamCode}` : "";
  const canResetAuthcode = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.team?.resetAuthcode);

  const showCompact = size === "small";
  const canConfig = allowConfig && !!onUpdateConfig;

  const handleConfirmConfig = () => {
    if (onUpdateConfig) {
      onUpdateConfig(widgetId, {
        teamCodeDisplayMode: configDisplayMode,
        teamCodeUsageCard: configDisplayMode === "usage" ? configUsageCard : undefined,
        teamCodeChartType: configDisplayMode === "chart" ? configChartType : undefined,
      });
      setConfigOpen(false);
    }
  };

  const formatYearMonth = (ym: string) => {
    if (!ym || ym.length < 7) return "本月";
    const [y, m] = ym.split("-");
    return `${y}年${parseInt(m, 10)}月`;
  };

  /** 使用量 + breakdown：直接展示卡片，无外层容器；编辑态时卡片旁有删除按钮 */
  const isUsageWithBreakdown =
    teamCodeDisplayMode === "usage" && teamUsage?.breakdown;

  if (isUsageWithBreakdown) {
    const b = teamUsage!.breakdown!;
    const baseLimit = b.base_token_limit ?? 0;
    const giftTokens = b.gift_tokens ?? 0;
    const extraTokens = b.extra_tokens ?? 0;
    const rollover = b.rollover_from_prev_tokens ?? 0;
    const tokensUsed = b.tokens_used;
    const hasRecorded =
      (b.gift_tokens_used ?? 0) +
      (b.rollover_tokens_used ?? 0) +
      (b.base_tokens_used ?? 0) +
      (b.extra_tokens_used ?? 0) ===
      tokensUsed;
    const giftUsed = hasRecorded ? (b.gift_tokens_used ?? 0) : Math.min(tokensUsed, giftTokens);
    const rolloverUsed = hasRecorded
      ? (b.rollover_tokens_used ?? 0)
      : Math.min(tokensUsed - giftUsed, rollover);
    const baseUsed = hasRecorded
      ? (b.base_tokens_used ?? 0)
      : Math.min(tokensUsed - giftUsed - rolloverUsed, baseLimit);
    const extraUsed = hasRecorded
      ? (b.extra_tokens_used ?? 0)
      : tokensUsed - giftUsed - rolloverUsed - baseUsed;
    const outOfPackageUsed = giftUsed + extraUsed;
    const outOfPackageTotal = giftTokens + extraTokens;
    const giftRemaining = Math.max(0, giftTokens - giftUsed);
    const purchaseRemaining = Math.max(0, extraTokens - extraUsed);
    /** 单选：仅展示选中类型的单张卡片；设置、删除仅在编辑模式显示，位置与其他组件一致（卡片右上角） */
    const selectedCard = teamCodeUsageCard;
    const cardAction =
      allowConfig ? (
        <div className="flex items-center gap-1 shrink-0">
          {onUpdateConfig && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              title="内容设置"
              onClick={() => setConfigOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              title="删除"
              onClick={() => onRemove(widgetId)}
            >
              <MinusCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : undefined;
    const renderCard = () => {
      if (selectedCard === "package") {
        return (
          <UsageStatCard
            className="flex-1 min-h-0 w-full"
            matchHeaderLayout
            title="套餐状态"
            value={
              <span className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{baseUsed.toLocaleString()}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  / {baseLimit.toLocaleString()}
                </span>
              </span>
            }
            action={cardAction}
            contextText="已使用 / 套餐总数"
            valueSize={showCompact ? "compact" : "default"}
          />
        );
      }
      if (selectedCard === "extra") {
        return (
          <UsageStatCard
            className="flex-1 min-h-0 w-full"
            matchHeaderLayout
            title="套餐外额度"
            value={
              <span className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{outOfPackageUsed.toLocaleString()}</span>
                {outOfPackageTotal > 0 ? (
                  <span className="text-sm font-normal text-muted-foreground">
                    / {outOfPackageTotal.toLocaleString()}
                  </span>
                ) : outOfPackageUsed > 0 ? (
                  <span className="text-sm font-normal text-muted-foreground">(超出套餐)</span>
                ) : null}
              </span>
            }
            action={cardAction}
            contextText={outOfPackageTotal > 0 ? "已使用/总套餐外额度" : "超出套餐部分"}
            contextHelp={
              giftRemaining > 0 || purchaseRemaining > 0
                ? [
                    giftRemaining > 0 && `赠送剩余 ${giftRemaining.toLocaleString()}（优先消耗）`,
                    purchaseRemaining > 0 && `购买剩余 ${purchaseRemaining.toLocaleString()}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : undefined
            }
            valueSize={showCompact ? "compact" : "default"}
          />
        );
      }
      if (selectedCard === "rollover") {
        return (
          <UsageStatCard
            className="flex-1 min-h-0 w-full"
            matchHeaderLayout
            title="上月结余"
            value={
              <span className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{rolloverUsed.toLocaleString()}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  / {rollover.toLocaleString()}
                </span>
              </span>
            }
            action={cardAction}
            contextText="结余总数"
            valueSize={showCompact ? "compact" : "default"}
          />
        );
      }
      return null;
    };
    const onlyCards = (
      <div className="h-full w-full flex flex-1 min-h-0">
        {renderCard()}
      </div>
    );
    return (
      <>
        {onlyCards}
        <Dialog open={configOpen} onOpenChange={setConfigOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>配置团队 Code</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <p className="text-sm font-medium mb-2">展示模式</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={configDisplayMode === "authcode" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setConfigDisplayMode("authcode")}
                  >
                    <Key className="h-4 w-4" />
                    认证码
                  </Button>
                  <Button
                    type="button"
                    variant={configDisplayMode === "usage" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setConfigDisplayMode("usage")}
                  >
                    <BarChart3 className="h-4 w-4" />
                    使用量
                  </Button>
                  <Button
                    type="button"
                    variant={configDisplayMode === "chart" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setConfigDisplayMode("chart")}
                  >
                    <LineChartIcon className="h-4 w-4" />
                    图表
                  </Button>
                </div>
              </div>
              {configDisplayMode === "usage" && (
                <div>
                  <p className="text-sm font-medium mb-2">展示的统计卡片</p>
                  <Select value={configUsageCard} onValueChange={(v) => setConfigUsageCard(v as TeamCodeUsageCard)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择卡片" />
                    </SelectTrigger>
                    <SelectContent>
                      {USAGE_CARD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {configDisplayMode === "chart" && (
                <div>
                  <p className="text-sm font-medium mb-2">图表类型</p>
                  <Select value={configChartType} onValueChange={(v) => setConfigChartType(v as TeamCodeChartType)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择图表" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHART_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfigOpen(false)}>
                取消
              </Button>
              <Button onClick={handleConfirmConfig}>确定</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  /** 图表模式：无外层 Card，同套餐外额度等卡片 */
  if (teamCodeDisplayMode === "chart") {
    const chartAction =
      allowConfig ? (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="查看用量日志"
            onClick={() => setLogsDialogOpen(true)}
          >
            <History className="h-4 w-4" />
          </Button>
          {onUpdateConfig && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              title="内容设置"
              onClick={() => setConfigOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              title="删除"
              onClick={() => onRemove(widgetId)}
            >
              <MinusCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          title="查看用量日志"
          onClick={() => setLogsDialogOpen(true)}
        >
          <History className="h-4 w-4" />
        </Button>
      );

    const chartContent = chartLoading ? (
      <p className="text-xs text-muted-foreground py-4">加载中...</p>
    ) : teamCodeChartType === "line" ? (
      dailyItems.length > 0 ? (
        <div className="w-full h-full min-h-[140px] overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              key={chartKey}
              data={dailyItems.map((d) => ({ ...d, tokens_used: Math.round(d.tokens_used ?? 0) }))}
              margin={{ top: 8, right: 8, bottom: 8, left: 36 }}
            >
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(v) => formatUsage(v)} allowDecimals={false} />
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.[0] ? (
                    <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow">
                      <span className="text-muted-foreground">Token 用量：</span>
                      <span className="font-medium">{formatUsage(payload[0].value as number)}</span>
                    </div>
                  ) : null
                }
              />
              <Line type="monotone" dataKey="tokens_used" stroke={chartColors[0]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm border border-dashed rounded-lg">
          暂无近7日用量数据
        </div>
      )
    ) : byBusinessItems.length > 0 ? (
      <div className="w-full h-full min-h-[140px] overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart key={chartKey} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Pie
              data={byBusinessItems.map((d, i) => ({
                name: d.business_name && String(d.business_name) !== "undefined" ? d.business_name : "(未分类)",
                value: Math.round(d.tokens_used ?? 0),
                fill: chartColors[i % chartColors.length],
              }))}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="40%"
              outerRadius="70%"
              paddingAngle={1}
              label={({ name, percent }) => `${name ?? "(未分类)"} ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {byBusinessItems.map((_, i) => (
                <Cell key={i} fill={chartColors[i % chartColors.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow">
                    <div className="font-medium">{payload[0].name}</div>
                    <span className="text-muted-foreground">Token 用量：</span>
                    <span className="font-medium">{formatUsage(payload[0].value as number)}</span>
                  </div>
                ) : null
              }
            />
            <Legend layout="horizontal" align="center" verticalAlign="bottom" />
          </PieChart>
        </ResponsiveContainer>
      </div>
    ) : (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm border border-dashed rounded-lg">
        暂无按业务用量数据
      </div>
    );

    /** 无外层容器，与套餐外额度等卡片一致：单卡片布局 */
    const onlyChart = (
      <div className="h-full w-full flex flex-1 min-h-0 overflow-hidden">
        <Card className="flex-1 min-h-0 min-w-0 flex flex-col py-0 shadow-sm border-border/60 overflow-hidden">
          <CardContent className="flex flex-col flex-1 min-h-0 px-4 pt-3 pb-3 overflow-hidden">
            <div className="flex justify-between items-center gap-2 shrink-0">
              <span className="text-sm font-medium text-muted-foreground">
                {teamCodeChartType === "line" ? "近7日用量" : "按业务用量"}
              </span>
              {chartAction}
            </div>
            <div
              ref={chartContainerRef}
              className="flex-1 min-h-0 w-full min-w-0 h-full overflow-hidden mt-2"
              style={{ minHeight: 140 }}
            >
              {chartContent}
            </div>
          </CardContent>
        </Card>
      </div>
    );
    return (
      <>
        {onlyChart}
        <Dialog open={configOpen} onOpenChange={setConfigOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>配置团队 Code</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <p className="text-sm font-medium mb-2">展示模式</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={configDisplayMode === "authcode" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setConfigDisplayMode("authcode")}
                  >
                    <Key className="h-4 w-4" />
                    认证码
                  </Button>
                  <Button
                    type="button"
                    variant={configDisplayMode === "usage" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setConfigDisplayMode("usage")}
                  >
                    <BarChart3 className="h-4 w-4" />
                    使用量
                  </Button>
                  <Button
                    type="button"
                    variant={configDisplayMode === "chart" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setConfigDisplayMode("chart")}
                  >
                    <LineChartIcon className="h-4 w-4" />
                    图表
                  </Button>
                </div>
              </div>
              {configDisplayMode === "chart" && (
                <div>
                  <p className="text-sm font-medium mb-2">图表类型</p>
                  <Select value={configChartType} onValueChange={(v) => setConfigChartType(v as TeamCodeChartType)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择图表" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHART_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfigOpen(false)}>
                取消
              </Button>
              <Button onClick={handleConfirmConfig}>确定</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <UsageLogsDialog
          open={logsDialogOpen}
          onOpenChange={setLogsDialogOpen}
          defaultYearMonth={new Date().toISOString().slice(0, 7)}
        />
      </>
    );
  }

  return (
    <>
      <Card className="h-full flex flex-col py-0">
        <CardHeader className="flex flex-row items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            {teamCodeDisplayMode === "authcode" ? (
              <Key className="h-4 w-4 text-primary" />
            ) : (
              <BarChart3 className="h-4 w-4 text-primary" />
            )}
            <CardTitle className="text-sm font-medium">
              {teamCodeDisplayMode === "authcode" ? "API 认证码" : "使用量统计"}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {canConfig && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                title="配置"
                onClick={() => setConfigOpen(true)}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            )}
            {teamName && (
              <Badge variant="outline" className="font-mono text-xs">
                {teamName}
              </Badge>
            )}
            {onRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => onRemove(widgetId)}
              >
                <MinusCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 px-4 pb-4 pt-0">
          {teamCodeDisplayMode === "authcode" ? (
            authcode ? (
              <div className="space-y-2">
                {!showCompact && (
                  <CardDescription className="mt-0 text-xs">
                    用于调用 /api 接口，请求头添加 X-Team-AuthCode
                  </CardDescription>
                )}
                <div className="flex items-center gap-2">
                  <code className="block flex-1 min-w-0 text-xs font-mono bg-muted px-2 py-1.5 rounded border break-all truncate">
                    {authcode}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={handleCopyAuthcode}
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                  {teamCode && canResetAuthcode && !showCompact && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setResetDialogOpen(true)}
                      className="shrink-0"
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      重置
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                未找到团队认证码，请联系管理员
              </p>
            )
          ) : (
            <div
              className={
                teamUsage && !allowConfig ? "flex flex-1 flex-col min-h-0" : "space-y-2"
              }
            >
              {usageLoading ? (
                <p className="text-xs text-muted-foreground">加载中...</p>
              ) : teamUsage?.breakdown ? (
                (() => {
                  const b = teamUsage.breakdown;
                  const baseLimit = b.base_token_limit ?? 0;
                  const giftTokens = b.gift_tokens ?? 0;
                  const extraTokens = b.extra_tokens ?? 0;
                  const rollover = b.rollover_from_prev_tokens ?? 0;
                  const tokensUsed = b.tokens_used;
                  const hasRecorded =
                    (b.gift_tokens_used ?? 0) +
                    (b.rollover_tokens_used ?? 0) +
                    (b.base_tokens_used ?? 0) +
                    (b.extra_tokens_used ?? 0) ===
                    tokensUsed;
                  const giftUsed = hasRecorded
                    ? (b.gift_tokens_used ?? 0)
                    : Math.min(tokensUsed, giftTokens);
                  const rolloverUsed = hasRecorded
                    ? (b.rollover_tokens_used ?? 0)
                    : Math.min(tokensUsed - giftUsed, rollover);
                  const baseUsed = hasRecorded
                    ? (b.base_tokens_used ?? 0)
                    : Math.min(tokensUsed - giftUsed - rolloverUsed, baseLimit);
                  const extraUsed = hasRecorded
                    ? (b.extra_tokens_used ?? 0)
                    : tokensUsed - giftUsed - rolloverUsed - baseUsed;
                  const outOfPackageUsed = giftUsed + extraUsed;
                  const outOfPackageTotal = giftTokens + extraTokens;
                  const giftRemainingAlt = Math.max(0, giftTokens - giftUsed);
                  const purchaseRemainingAlt = Math.max(0, extraTokens - extraUsed);
                  const selectedCard = teamCodeUsageCard;
                  const showCardBorder = allowConfig;
                  const renderCard = () => {
                    if (selectedCard === "package") {
                      return (
                        <UsageStatCard
                          className="flex-1 min-h-0 w-full"
                          borderless={!showCardBorder}
                          title="套餐状态"
                          value={
                            <span className="flex items-baseline gap-1">
                              <span className="text-2xl font-bold">{baseUsed.toLocaleString()}</span>
                              <span className="text-sm font-normal text-muted-foreground">
                                / {baseLimit.toLocaleString()}
                              </span>
                            </span>
                          }
                          contextText="已使用 / 套餐总数"
                          valueSize={showCompact ? "compact" : "default"}
                        />
                      );
                    }
                    if (selectedCard === "extra") {
                      return (
                        <UsageStatCard
                          className="flex-1 min-h-0 w-full"
                          borderless={!showCardBorder}
                          title="套餐外额度"
                          value={
                            <span className="flex items-baseline gap-1">
                              <span className="text-2xl font-bold">{outOfPackageUsed.toLocaleString()}</span>
                              {outOfPackageTotal > 0 ? (
                                <span className="text-sm font-normal text-muted-foreground">
                                  / {outOfPackageTotal.toLocaleString()}
                                </span>
                              ) : outOfPackageUsed > 0 ? (
                                <span className="text-sm font-normal text-muted-foreground">(超出套餐)</span>
                              ) : null}
                            </span>
                          }
                          contextText={outOfPackageTotal > 0 ? "已使用/总套餐外额度" : "超出套餐部分"}
                          contextHelp={
                            giftRemainingAlt > 0 || purchaseRemainingAlt > 0
                              ? [
                                  giftRemainingAlt > 0 && `赠送剩余 ${giftRemainingAlt.toLocaleString()}（优先消耗）`,
                                  purchaseRemainingAlt > 0 && `购买剩余 ${purchaseRemainingAlt.toLocaleString()}`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")
                              : undefined
                          }
                          valueSize={showCompact ? "compact" : "default"}
                        />
                      );
                    }
                    if (selectedCard === "rollover") {
                      return (
                        <UsageStatCard
                          className="flex-1 min-h-0 w-full"
                          borderless={!showCardBorder}
                          title="上月结余"
                          value={
                            <span className="flex items-baseline gap-1">
                              <span className="text-2xl font-bold">{rolloverUsed.toLocaleString()}</span>
                              <span className="text-sm font-normal text-muted-foreground">
                                / {rollover.toLocaleString()}
                              </span>
                            </span>
                          }
                          contextText="结余总数"
                          valueSize={showCompact ? "compact" : "default"}
                        />
                      );
                    }
                    return null;
                  };
                  return (
                    <div className="flex flex-1 flex-row min-h-0 items-stretch">
                      <div className="flex-1 min-w-0 flex min-h-0">{renderCard()}</div>
                    </div>
                  );
                })()
              ) : teamUsage ? (
                <div
                  className={
                    allowConfig
                      ? showCompact
                        ? "grid grid-cols-2 gap-2"
                        : "grid grid-cols-2 gap-3"
                      : "flex flex-1 min-h-0"
                  }
                >
                  {allowConfig ? (
                    <UsageStatCard
                      borderless={!allowConfig}
                      title="Token 本月"
                      value={
                        teamUsage.token_limit != null && teamUsage.token_limit > 0
                          ? `${teamUsage.tokens_used.toLocaleString()} / ${teamUsage.token_limit.toLocaleString()}`
                          : teamUsage.tokens_used.toLocaleString()
                      }
                      badge={formatYearMonth(teamUsage.year_month)}
                      contextText={
                        teamUsage.token_limit != null && teamUsage.token_limit > 0
                          ? `剩余 ${Math.max(0, teamUsage.token_limit - teamUsage.tokens_used).toLocaleString()}`
                          : undefined
                      }
                      valueSize={showCompact ? "compact" : "default"}
                    />
                  ) : (
                    <div className="flex-1 min-w-0">
                      <UsageStatCard
                        title="Token 本月"
                        value={
                          teamUsage.token_limit != null && teamUsage.token_limit > 0
                            ? `${teamUsage.tokens_used.toLocaleString()} / ${teamUsage.token_limit.toLocaleString()}`
                            : teamUsage.tokens_used.toLocaleString()
                        }
                        badge={formatYearMonth(teamUsage.year_month)}
                        contextText={
                          teamUsage.token_limit != null && teamUsage.token_limit > 0
                            ? `剩余 ${Math.max(0, teamUsage.token_limit - teamUsage.tokens_used).toLocaleString()}`
                            : undefined
                        }
                        valueSize={showCompact ? "compact" : "default"}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  未找到团队用量信息，请联系管理员
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>配置团队 Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-medium mb-2">展示模式</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={configDisplayMode === "authcode" ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setConfigDisplayMode("authcode")}
                >
                  <Key className="h-4 w-4" />
                  认证码
                </Button>
                <Button
                  type="button"
                  variant={configDisplayMode === "usage" ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setConfigDisplayMode("usage")}
                >
                  <BarChart3 className="h-4 w-4" />
                  使用量
                </Button>
                <Button
                  type="button"
                  variant={configDisplayMode === "chart" ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setConfigDisplayMode("chart")}
                >
                  <LineChartIcon className="h-4 w-4" />
                  图表
                </Button>
              </div>
            </div>
            {configDisplayMode === "usage" && (
              <div>
                <p className="text-sm font-medium mb-2">展示的统计卡片</p>
                <Select value={configUsageCard} onValueChange={(v) => setConfigUsageCard(v as TeamCodeUsageCard)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择卡片" />
                  </SelectTrigger>
                  <SelectContent>
                    {USAGE_CARD_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {configDisplayMode === "chart" && (
              <div>
                <p className="text-sm font-medium mb-2">图表类型</p>
                <Select value={configChartType} onValueChange={(v) => setConfigChartType(v as TeamCodeChartType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择图表" />
                  </SelectTrigger>
                  <SelectContent>
                    {CHART_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>
              取消
            </Button>
            <Button onClick={handleConfirmConfig}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重置认证码</AlertDialogTitle>
            <AlertDialogDescription>
              确定要重置团队认证码吗？重置后旧认证码将立即失效。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetAuthcode}
              disabled={resetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting ? "重置中..." : "确认重置"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UsageLogsDialog
        open={logsDialogOpen}
        onOpenChange={setLogsDialogOpen}
        defaultYearMonth={new Date().toISOString().slice(0, 7)}
      />
    </>
  );
}

const WidgetTeamCode = observer(WidgetTeamCodeImpl);

export { WidgetTeamCode };
