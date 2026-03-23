"use client";

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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { History } from "@/components/icons";
import { FieldHelp } from "@/components/ui/field-help";
import { UsageStatCard } from "./usage-stat-card";
import { QuotaHistoryDialog } from "./quota-history-dialog";
import { formatYearMonthToDisplay } from "@/lib/utils/year-month";
import { cn } from "@/lib/utils";
import type { PointsAdjustmentType } from "../hooks/use-quota-management";
import type { useQuotaManagement } from "../hooks/use-quota-management";

export type QuotaManagementDialogProps = ReturnType<typeof useQuotaManagement> & {
  error: string;
  setError: (msg: string) => void;
};

/**
 * 团队配额管理对话框
 * 包含：签约/续约、追加积点、解约、缴费历史
 */
export function QuotaManagementDialog({
  open,
  setOpen,
  team: quotaTeam,
  quotaDetail,
  quotaLoading,
  packageSaving,
  quotaTopupSaving,
  packagePreset,
  setPackagePreset,
  packageMonthlyPointsInput,
  setPackageMonthlyPointsInput,
  packageDurationMonthsInput,
  setPackageDurationMonthsInput,
  selectedAmountPresets,
  setSelectedAmountPresets,
  packageOverview,
  adjustmentTypeInput,
  setAdjustmentTypeInput,
  adjustmentCommentInput,
  setAdjustmentCommentInput,
  cancelMonthsInput,
  setCancelMonthsInput,
  cancelSaving,
  cancelConfirmOpen,
  setCancelConfirmOpen,
  quotaHistoryDialogOpen,
  setQuotaHistoryDialogOpen,
  quotaTabValue,
  setQuotaTabValue,
  contractSigningDay,
  currentYearMonth,
  hasPackage,
  cancelStats,
  PACKAGE_PRESETS,
  localAdjustments,
  handleSavePackage,
  handleAddAdjustment,
  handleSelectMonth,
  handleCancelPackage,
  error,
  setError,
}: QuotaManagementDialogProps) {
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setPackageMonthlyPointsInput("");
      setPackageDurationMonthsInput("6");
      setSelectedAmountPresets([]);
      setError("");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-5xl h-[90vh] min-h-[560px] flex flex-col overflow-hidden">
          <DialogHeader className="pr-10 sm:text-left">
            <DialogTitle className="text-lg">
              {quotaTeam?.name ?? "团队配额管理"}
            </DialogTitle>
          </DialogHeader>

          {!quotaDetail ? (
            <div className="py-6 text-sm text-muted-foreground">加载中...</div>
          ) : (
            <>
              <Tabs
                value={quotaTabValue}
                onValueChange={setQuotaTabValue}
                className="flex-1 min-h-0 flex flex-col overflow-hidden"
              >
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className="hidden sm:block space-y-3 shrink-0">
                    {hasPackage ? (
                      (() => {
                        const monthData = packageOverview?.months.find(
                          (m) => m.year_month === quotaDetail.year_month
                        );
                        const rollover = monthData?.rollover_from_prev_points ?? 0;
                        const cardCount = rollover > 0 ? 3 : 2;
                        const baseLimit = monthData?.base_points_limit ?? 0;
                        let giftPoints = monthData?.gift_points ?? 0;
                        let extraPoints = monthData?.extra_points ?? 0;
                        if (
                          giftPoints + extraPoints === 0 &&
                          (packageOverview?.months?.length ?? 0) > 0
                        ) {
                          const firstWithTopup = packageOverview?.months.find(
                            (m) =>
                              (m.gift_points ?? 0) + (m.extra_points ?? 0) > 0
                          );
                          if (firstWithTopup) {
                            giftPoints = firstWithTopup.gift_points ?? 0;
                            extraPoints = firstWithTopup.extra_points ?? 0;
                          }
                        }
                        const pointsUsed = quotaDetail.points_used;
                        const hasRecorded =
                          (monthData?.gift_points_used ?? 0) +
                            (monthData?.rollover_points_used ?? 0) +
                            (monthData?.base_points_used ?? 0) +
                            (monthData?.extra_points_used ?? 0) ===
                          pointsUsed;
                        const giftUsed = hasRecorded
                          ? (monthData?.gift_points_used ?? 0)
                          : Math.min(pointsUsed, giftPoints);
                        const rolloverUsed = hasRecorded
                          ? (monthData?.rollover_points_used ?? 0)
                          : Math.min(pointsUsed - giftUsed, rollover);
                        const baseUsed = hasRecorded
                          ? (monthData?.base_points_used ?? 0)
                          : Math.min(
                              pointsUsed - giftUsed - rolloverUsed,
                              baseLimit
                            );
                        const extraUsed = hasRecorded
                          ? (monthData?.extra_points_used ?? 0)
                          : pointsUsed - giftUsed - rolloverUsed - baseUsed;
                        const outOfPackageUsed = giftUsed + extraUsed;
                        const outOfPackageTotal = giftPoints + extraPoints;
                        const giftRemaining = Math.max(0, giftPoints - giftUsed);
                        const purchaseRemaining = Math.max(
                          0,
                          extraPoints - extraUsed
                        );
                        return (
                          <div
                            className={cn(
                              "grid gap-4 items-stretch",
                              cardCount === 3
                                ? "grid-cols-1 sm:grid-cols-3"
                                : "grid-cols-1 sm:grid-cols-2"
                            )}
                          >
                            <UsageStatCard
                              title="套餐状态"
                              value={
                                <span className="flex items-baseline gap-1">
                                  <span className="text-2xl font-bold">
                                    {baseUsed.toLocaleString()}
                                  </span>
                                  <span className="text-sm font-normal text-muted-foreground">
                                    / {baseLimit.toLocaleString()}
                                  </span>
                                </span>
                              }
                              badge={formatYearMonthToDisplay(
                                quotaDetail.year_month,
                                contractSigningDay
                              )}
                              contextText="已使用 / 套餐总数"
                            />
                            <UsageStatCard
                              title="套餐外额度"
                              value={
                                <span className="flex items-baseline gap-1">
                                  <span className="text-2xl font-bold">
                                    {outOfPackageUsed.toLocaleString()}
                                  </span>
                                  <span className="text-sm font-normal text-muted-foreground">
                                    / {outOfPackageTotal.toLocaleString()}
                                  </span>
                                </span>
                              }
                              contextText="已使用/总套餐外额度"
                              contextHelp={
                                (giftRemaining > 0 || purchaseRemaining > 0)
                                  ? [
                                      giftRemaining > 0 &&
                                        `赠送剩余 ${giftRemaining.toLocaleString()}（优先消耗）`,
                                      purchaseRemaining > 0 &&
                                        `购买剩余 ${purchaseRemaining.toLocaleString()}`,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")
                                  : undefined
                              }
                            />
                            {rollover > 0 && (
                              <UsageStatCard
                                title="上月结余"
                                value={
                                  <span className="flex items-baseline gap-1">
                                    <span className="text-2xl font-bold">
                                      {rolloverUsed.toLocaleString()}
                                    </span>
                                    <span className="text-sm font-normal text-muted-foreground">
                                      / {rollover.toLocaleString()}
                                    </span>
                                  </span>
                                }
                                contextText="结余总数"
                              />
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="grid grid-cols-1 max-w-[320px] gap-4 items-stretch">
                        {(() => {
                          const monthData = packageOverview?.months.find(
                            (m) => m.year_month === quotaDetail.year_month
                          );
                          let giftPoints = monthData?.gift_points ?? 0;
                          let extraPoints = monthData?.extra_points ?? 0;
                          if (
                            giftPoints + extraPoints === 0 &&
                            (packageOverview?.months?.length ?? 0) > 0
                          ) {
                            const firstWithTopup = packageOverview?.months.find(
                              (m) =>
                                (m.gift_points ?? 0) + (m.extra_points ?? 0) > 0
                            );
                            if (firstWithTopup) {
                              giftPoints = firstWithTopup.gift_points ?? 0;
                              extraPoints = firstWithTopup.extra_points ?? 0;
                            }
                          }
                          const pointsUsed = quotaDetail.points_used;
                          const outOfPackageTotal = giftPoints + extraPoints;
                          const outOfPackageUsed = Math.min(
                            pointsUsed,
                            outOfPackageTotal
                          );
                          const giftRemaining = Math.max(
                            0,
                            giftPoints - Math.min(pointsUsed, giftPoints)
                          );
                          const purchaseRemaining = Math.max(
                            0,
                            extraPoints -
                              Math.min(
                                Math.max(0, pointsUsed - giftPoints),
                                extraPoints
                              )
                          );
                          return (
                            <UsageStatCard
                              title="套餐外额度"
                              value={
                                <span className="flex items-baseline gap-1">
                                  <span className="text-2xl font-bold">
                                    {outOfPackageUsed.toLocaleString()}
                                  </span>
                                  <span className="text-sm font-normal text-muted-foreground">
                                    /{" "}
                                    {outOfPackageTotal > 0
                                      ? outOfPackageTotal.toLocaleString()
                                      : "0"}
                                  </span>
                                </span>
                              }
                              contextText="总额度 = 赠送 + 购买"
                              contextHelp={
                                (giftRemaining > 0 || purchaseRemaining > 0)
                                  ? [
                                      giftRemaining > 0 &&
                                        `赠送剩余 ${giftRemaining.toLocaleString()}（优先消耗）`,
                                      purchaseRemaining > 0 &&
                                        `购买剩余 ${purchaseRemaining.toLocaleString()}`,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")
                                  : undefined
                              }
                            />
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 mt-4 shrink-0">
                    <TabsList
                      className={cn(
                        "grid w-full sm:w-fit shrink-0",
                        hasPackage
                          ? "grid-cols-3 sm:max-w-[300px]"
                          : "grid-cols-2 sm:max-w-[200px]"
                      )}
                    >
                      <TabsTrigger value="renewal">
                        {hasPackage ? "续约" : "签约"}
                      </TabsTrigger>
                      <TabsTrigger value="topup">追加</TabsTrigger>
                      {hasPackage && (
                        <TabsTrigger value="cancel">解约</TabsTrigger>
                      )}
                    </TabsList>
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setQuotaHistoryDialogOpen(true)}
                        title="缴费历史记录"
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      {quotaDetail &&
                        hasPackage &&
                        packageOverview &&
                        packageOverview.months.length > 0 && (
                          <Select
                            value={quotaDetail.year_month}
                            onValueChange={(v) => handleSelectMonth(v)}
                            disabled={quotaLoading}
                          >
                            <SelectTrigger className="w-full sm:w-auto min-w-0 sm:min-w-[220px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(() => {
                                const filtered = packageOverview.months.filter(
                                  (m) => m.year_month >= currentYearMonth
                                );
                                const monthsToShow =
                                  filtered.length > 0
                                    ? filtered
                                    : packageOverview.months;
                                return monthsToShow.map((m) => {
                                  const isFuture =
                                    m.year_month > currentYearMonth;
                                  return (
                                    <SelectItem
                                      key={m.year_month}
                                      value={m.year_month}
                                      disabled={
                                        !isFuture &&
                                        m.year_month !== currentYearMonth
                                      }
                                    >
                                      {formatYearMonthToDisplay(
                                        m.year_month,
                                        contractSigningDay
                                      )}
                                    </SelectItem>
                                  );
                                });
                              })()}
                            </SelectContent>
                          </Select>
                        )}
                    </div>
                  </div>

                  <TabsContent
                    value="renewal"
                    className="mt-4 data-[state=inactive]:hidden flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1"
                  >
                    <div className="flex flex-col flex-1 min-h-0 pb-0">
                      <Card className="shadow-sm flex-1 flex flex-col min-h-0">
                        <CardHeader className="pb-3 shrink-0">
                          <CardTitle className="text-base font-semibold">
                            套餐配置
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-0 flex-1 min-h-0">
                          <div className="space-y-2 shrink-0">
                            <Label className="text-sm font-medium">
                              选择套餐
                            </Label>
                            <Select
                              value={packagePreset}
                              onValueChange={(v) => {
                                const key = v as
                                  | "plan1"
                                  | "plan2"
                                  | "plan3"
                                  | "custom";
                                setPackagePreset(key);
                                if (key !== "custom") {
                                  const p = PACKAGE_PRESETS[key];
                                  setPackageMonthlyPointsInput(String(p.monthly));
                                  setPackageDurationMonthsInput(String(p.months));
                                }
                              }}
                            >
                              <SelectTrigger className="w-full sm:w-[220px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="plan1">
                                  套餐一 12月 每月15000
                                </SelectItem>
                                <SelectItem value="plan2">
                                  套餐二 12月 每月20000
                                </SelectItem>
                                <SelectItem value="plan3">
                                  套餐三 12月 每月30000
                                </SelectItem>
                                <SelectItem value="custom">自定义</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {packagePreset === "custom" && (
                            <>
                              <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
                                <div className="space-y-2 shrink-0">
                                  <Label
                                    htmlFor="package-monthly-points"
                                    className="text-sm font-medium"
                                  >
                                    每月套餐积点配额
                                  </Label>
                                  <Input
                                    id="package-monthly-points"
                                    type="number"
                                    min={0}
                                    placeholder="例如：30000（0 表示不限）"
                                    value={packageMonthlyPointsInput}
                                    onChange={(e) =>
                                      setPackageMonthlyPointsInput(
                                        e.target.value
                                      )
                                    }
                                    className="max-w-[200px]"
                                  />
                                </div>
                                <div className="space-y-1 shrink-0">
                                  <Label
                                    htmlFor="package-duration-months"
                                    className="text-sm font-medium"
                                  >
                                    套餐持续月份
                                  </Label>
                                  <Input
                                    id="package-duration-months"
                                    type="number"
                                    min={1}
                                    max={60}
                                    placeholder="例如：6"
                                    value={packageDurationMonthsInput}
                                    onChange={(e) =>
                                      setPackageDurationMonthsInput(
                                        e.target.value
                                      )
                                    }
                                    className="max-w-[200px]"
                                  />
                                </div>
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  <TabsContent
                    value="topup"
                    className="mt-4 data-[state=inactive]:hidden flex flex-col flex-1 min-h-0"
                  >
                    <div className="flex flex-col gap-5 flex-1 min-h-0">
                      <Card className="shadow-sm flex-1 flex flex-col min-h-0">
                        <CardHeader className="pb-3 shrink-0">
                          <CardTitle className="text-base font-semibold">
                            本月积点追加数据
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col flex-1 min-h-0 pt-0 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">
                                类型
                              </Label>
                              <Select
                                value={adjustmentTypeInput}
                                onValueChange={(v) =>
                                  setAdjustmentTypeInput(
                                    v as PointsAdjustmentType
                                  )
                                }
                              >
                                <SelectTrigger className="w-[110px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="gift">赠送</SelectItem>
                                  <SelectItem value="purchase">购买</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">
                                数量
                              </Label>
                              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                                {[5000, 10000, 15000, 20000].map((n) => {
                                  const isSelected =
                                    selectedAmountPresets.includes(n);
                                  return (
                                    <Button
                                      key={n}
                                      type="button"
                                      variant={
                                        isSelected ? "default" : "outline"
                                      }
                                      size="sm"
                                      className="h-9 w-full sm:w-auto sm:min-w-[72px] tabular-nums"
                                      onClick={() => {
                                        setSelectedAmountPresets((prev) =>
                                          prev.includes(n)
                                            ? prev.filter((x) => x !== n)
                                            : [...prev, n]
                                        );
                                      }}
                                    >
                                      {n.toLocaleString()}
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label
                              htmlFor="adjustment-comment"
                              className="text-sm font-medium"
                            >
                              备注
                            </Label>
                            <Textarea
                              id="adjustment-comment"
                              placeholder="备注说明，支持换行"
                              value={adjustmentCommentInput}
                              onChange={(e) =>
                                setAdjustmentCommentInput(e.target.value)
                              }
                              className="min-h-[100px] max-h-[200px] resize-y w-full overflow-y-auto custom-scrollbar"
                              rows={4}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  {hasPackage && (
                    <TabsContent
                      value="cancel"
                      className="mt-4 data-[state=inactive]:hidden flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1"
                    >
                      <div className="flex flex-col flex-1 min-h-0 pb-0">
                        <Card className="shadow-sm flex-1 flex flex-col min-h-0">
                          <CardHeader className="pb-3 shrink-0">
                            <CardTitle className="text-base font-semibold">
                              解除续约
                            </CardTitle>
                            <p className="text-xs text-muted-foreground mt-1">
                              解除当月及未来月份的套餐配置，数量不得大于总合同数量。从最后一个月开始解约。
                            </p>
                          </CardHeader>
                          <CardContent className="space-y-4 pt-0 flex-1 min-h-0">
                            <div className="space-y-2 shrink-0">
                              <p className="text-sm text-muted-foreground">
                                总合同：
                                <span className="font-medium text-foreground">
                                  {cancelStats.totalMonths}
                                </span>{" "}
                                个月
                                {packageOverview?.start_year_month &&
                                  packageOverview?.end_year_month && (
                                    <span className="text-muted-foreground">
                                      （
                                      {formatYearMonthToDisplay(
                                        packageOverview.start_year_month,
                                        contractSigningDay
                                      )}{" "}
                                      至{" "}
                                      {formatYearMonthToDisplay(
                                        packageOverview.end_year_month,
                                        contractSigningDay
                                      )}
                                      ）
                                    </span>
                                  )}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                可解约：最多{" "}
                                <span className="font-medium text-foreground">
                                  {cancelStats.maxCancelMonths}
                                </span>{" "}
                                个月
                              </p>
                              {cancelStats.extraPointsSum > 0 && (
                                <p className="text-sm text-muted-foreground">
                                  额外追加积点总量：
                                  <span className="font-medium text-foreground tabular-nums">
                                    {cancelStats.extraPointsSum.toLocaleString()}
                                  </span>
                                </p>
                              )}
                            </div>
                            <div className="space-y-2 shrink-0">
                              <Label
                                htmlFor="cancel-months"
                                className="text-sm font-medium"
                              >
                                解约月数
                              </Label>
                              <Input
                                id="cancel-months"
                                type="number"
                                min={1}
                                max={cancelStats.maxCancelMonths}
                                placeholder={
                                  cancelStats.maxCancelMonths > 0
                                    ? `1 ~ ${cancelStats.maxCancelMonths}`
                                    : "无可解约月份"
                                }
                                value={cancelMonthsInput}
                                onChange={(e) =>
                                  setCancelMonthsInput(e.target.value)
                                }
                                className="max-w-[200px]"
                              />
                              <p className="text-xs text-muted-foreground">
                                解约月数不得大于 {cancelStats.maxCancelMonths}{" "}
                                个月。
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>
                  )}
                </div>

                <AlertDialog
                  open={cancelConfirmOpen}
                  onOpenChange={setCancelConfirmOpen}
                >
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认解约</AlertDialogTitle>
                      <AlertDialogDescription>
                        确定要解约 {cancelMonthsInput || "0"} 个月吗？解约将从最后一个月开始往前减少，解约后该月份将回退为团队默认配额，此操作不可恢复。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-white hover:bg-destructive/90"
                        onClick={async () => {
                          setCancelConfirmOpen(false);
                          await handleCancelPackage();
                        }}
                      >
                        确认解约
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive mt-4 shrink-0">
                    {error}
                  </div>
                )}
              </Tabs>

              <DialogFooter
                className={cn(
                  "shrink-0 gap-2 flex-col-reverse sm:flex-row",
                  (quotaTabValue === "topup" ||
                    quotaTabValue === "renewal") &&
                    "sm:justify-between"
                )}
              >
                {quotaTabValue === "renewal" && (
                  <>
                    <span className="text-sm text-muted-foreground order-2 sm:order-1 flex items-center gap-1">
                      {packagePreset === "custom" ? (
                        <>
                          从{" "}
                          {formatYearMonthToDisplay(
                            quotaDetail?.year_month ?? "",
                            contractSigningDay
                          )}{" "}
                          开始，连续{" "}
                          {packageDurationMonthsInput || "0"} 个月
                        </>
                      ) : (
                        <>
                          {packagePreset === "plan1" &&
                            "12 个月，每月 15,000 积点"}
                          {packagePreset === "plan2" &&
                            "12 个月，每月 20,000 积点"}
                          {packagePreset === "plan3" &&
                            "12 个月，每月 30,000 积点"}
                        </>
                      )}
                      <FieldHelp
                        content={'套餐会从当前月份开始，按"每月基础配额 + 结转 + 追加"计算有效额度。'}
                      />
                    </span>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 order-1 sm:order-2">
                      {packagePreset === "custom" && (
                        <Button
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() => {
                            setPackageMonthlyPointsInput("");
                            setPackageDurationMonthsInput("6");
                          }}
                        >
                          重置
                        </Button>
                      )}
                      <Button
                        className="w-full sm:w-auto"
                        onClick={handleSavePackage}
                        disabled={packageSaving}
                      >
                        {packageSaving ? "保存中..." : "保存套餐"}
                      </Button>
                    </div>
                  </>
                )}
                {quotaTabValue === "topup" && (
                  <>
                    <span className="text-sm text-muted-foreground order-2 sm:order-1">
                      合计：
                      <span className="font-semibold text-foreground tabular-nums">
                        {selectedAmountPresets.length > 0
                          ? selectedAmountPresets
                              .reduce((a, b) => a + b, 0)
                              .toLocaleString()
                          : "0"}
                      </span>
                    </span>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 order-1 sm:order-2">
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => setSelectedAmountPresets([])}
                      >
                        重置
                      </Button>
                      <Button
                        className="w-full sm:w-auto"
                        onClick={handleAddAdjustment}
                        disabled={
                          quotaTopupSaving ||
                          !quotaTeam ||
                          !quotaDetail ||
                          selectedAmountPresets.reduce((a, b) => a + b, 0) <= 0
                        }
                      >
                        {quotaTopupSaving ? "确定中..." : "确定"}
                      </Button>
                    </div>
                  </>
                )}
                {quotaTabValue === "cancel" && hasPackage && (
                  <>
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => setCancelMonthsInput("")}
                    >
                      重置
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      onClick={() => {
                        const n = Number(cancelMonthsInput);
                        if (Number.isNaN(n) || n <= 0) {
                          setError("请输入有效的解约月数");
                          return;
                        }
                        if (n > cancelStats.maxCancelMonths) {
                          setError(
                            `解约月数不能大于可解约月数（${cancelStats.maxCancelMonths} 个月）`
                          );
                          return;
                        }
                        setError("");
                        setCancelConfirmOpen(true);
                      }}
                      disabled={
                        cancelSaving || cancelStats.maxCancelMonths === 0
                      }
                    >
                      {cancelSaving ? "解约中..." : "解约"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <QuotaHistoryDialog
        open={quotaHistoryDialogOpen}
        onOpenChange={setQuotaHistoryDialogOpen}
        teamId={quotaTeam?.id}
        teamName={quotaTeam?.name}
        localAdjustments={localAdjustments}
        packageOverview={packageOverview}
      />
    </>
  );
}
