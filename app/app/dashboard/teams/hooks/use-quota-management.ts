import { useState, useCallback, useMemo, useEffect } from "react";
import {
  Team,
  getTeamQuota,
  topupTeamQuotaPoints,
  setTeamPackage,
  deleteTeamMonthlyPlan,
  getTeamPackageOverview,
  getTeamPaymentLogs,
  type TeamPackageOverview,
  type TeamQuotaDetail,
} from "@/lib/api/teams";

export type PointsAdjustmentType = "gift" | "purchase";
export interface PointsAdjustment {
  id: string;
  type: PointsAdjustmentType;
  amount: number;
  comment?: string;
  created_at: string;
}

const PACKAGE_PRESETS = {
  plan1: { months: 12, monthly: 15000 },
  plan2: { months: 12, monthly: 20000 },
  plan3: { months: 12, monthly: 30000 },
} as const;

export interface UseQuotaManagementProps {
  setError: (msg: string) => void;
  fetchTeams: (page: number) => void | Promise<void>;
  currentPage: number;
}

export function useQuotaManagement({
  setError,
  fetchTeams,
  currentPage,
}: UseQuotaManagementProps) {
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState<Team | null>(null);
  const [quotaDetail, setQuotaDetail] = useState<TeamQuotaDetail | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [packageSaving, setPackageSaving] = useState(false);
  const [quotaTopupSaving, setQuotaTopupSaving] = useState(false);
  const [deletingMonthlyPlan, setDeletingMonthlyPlan] = useState(false);
  const [packagePreset, setPackagePreset] = useState<"plan1" | "plan2" | "plan3" | "custom">("plan1");
  const [packageMonthlyPointsInput, setPackageMonthlyPointsInput] = useState<string>("");
  const [packageDurationMonthsInput, setPackageDurationMonthsInput] = useState<string>("6");
  const [selectedAmountPresets, setSelectedAmountPresets] = useState<number[]>([]);
  const [packageOverview, setPackageOverview] = useState<TeamPackageOverview | null>(null);
  const [packageOverviewLoading, setPackageOverviewLoading] = useState(false);
  const [selectedYearMonth, setSelectedYearMonth] = useState<string | null>(null);
  const [localAdjustments, setLocalAdjustments] = useState<Record<string, PointsAdjustment[]>>({});
  const [adjustmentTypeInput, setAdjustmentTypeInput] = useState<PointsAdjustmentType>("purchase");
  const [adjustmentCommentInput, setAdjustmentCommentInput] = useState<string>("");
  const [cancelMonthsInput, setCancelMonthsInput] = useState<string>("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [quotaHistoryDialogOpen, setQuotaHistoryDialogOpen] = useState(false);
  const [quotaTabValue, setQuotaTabValue] = useState("renewal");
  const [contractSigningDay, setContractSigningDay] = useState<number | null>(null);

  const currentYearMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}`;
  }, []);

  const openQuotaDialog = useCallback(
    async (t: Team) => {
      setError("");
      setTeam(t);
      setOpen(true);
      setQuotaTabValue("renewal");
      setQuotaDetail(null);
      setPackageOverview(null);
      setContractSigningDay(null);
      setPackagePreset("plan1");
      setPackageMonthlyPointsInput("15000");
      setPackageDurationMonthsInput("12");
      setSelectedAmountPresets([]);
      setSelectedYearMonth(null);
      setAdjustmentTypeInput("purchase");
      setAdjustmentCommentInput("");
      setCancelMonthsInput("");
      try {
        setQuotaLoading(true);
        setPackageOverviewLoading(true);
        const [detail, overview, paymentRes] = await Promise.all([
          getTeamQuota(t.id, {}),
          getTeamPackageOverview(t.id),
          getTeamPaymentLogs(t.id, { limit: 200 }),
        ]);
        setPackageOverview(overview);
        const months = overview?.months ?? [];
        const currentYm = detail.year_month;
        const isCurrentInOverview = months.some((m) => m.year_month === currentYm);
        let targetYm = currentYm;
        if (!isCurrentInOverview && months.length > 0) {
          const sorted = [...months].sort((a, b) => a.year_month.localeCompare(b.year_month));
          targetYm =
            currentYm < sorted[0]!.year_month
              ? sorted[0]!.year_month
              : sorted[sorted.length - 1]!.year_month;
          const targetDetail = await getTeamQuota(t.id, { year_month: targetYm });
          setQuotaDetail(targetDetail);
          setSelectedYearMonth(targetYm);
        } else {
          setQuotaDetail(detail);
          setSelectedYearMonth(currentYm);
        }
        type PaymentItem = { payment_type?: string; year_month?: string; created_at: string };
        const items: PaymentItem[] = Array.isArray(paymentRes?.items)
          ? (paymentRes.items as PaymentItem[])
          : ((paymentRes as { data?: { items?: PaymentItem[] } })?.data?.items ?? []);
        const contract = items
          .filter(
            (r) =>
              (r.payment_type === "contract" || r.payment_type === "renewal") && r.year_month
          )
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0];
        if (contract) {
          const d = new Date(contract.created_at);
          if (!Number.isNaN(d.getTime())) setContractSigningDay(d.getDate());
        }
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "加载配额信息失败，请稍后重试");
      } finally {
        setQuotaLoading(false);
        setPackageOverviewLoading(false);
      }
    },
    [setError]
  );

  const closeQuotaDialog = useCallback(() => {
    setOpen(false);
    setTeam(null);
    setQuotaDetail(null);
    setPackageMonthlyPointsInput("");
    setPackageDurationMonthsInput("6");
    setSelectedAmountPresets([]);
    setError("");
  }, [setError]);

  const handleSavePackage = useCallback(async () => {
    if (!team || !quotaDetail) return;
    try {
      setPackageSaving(true);
      let monthly: number;
      let duration: number;
      if (packagePreset === "custom") {
        monthly = Number(packageMonthlyPointsInput);
        if (Number.isNaN(monthly) || monthly < 0) {
          setError("每月积点配额必须为非负数字");
          setPackageSaving(false);
          return;
        }
        duration = Number(packageDurationMonthsInput || "0");
        if (Number.isNaN(duration) || duration <= 0) {
          setError("套餐持续月份必须为大于 0 的整数");
          setPackageSaving(false);
          return;
        }
      } else {
        const p = PACKAGE_PRESETS[packagePreset];
        monthly = p.monthly;
        duration = p.months;
      }

      await setTeamPackage(team.id, {
        monthly_points_limit: monthly,
        start_year_month: quotaDetail.year_month,
        duration_months: duration,
      });

      const [updatedDetail, updatedOverview, paymentRes] = await Promise.all([
        getTeamQuota(team.id, { year_month: quotaDetail.year_month }),
        getTeamPackageOverview(team.id),
        getTeamPaymentLogs(team.id, { limit: 200 }),
      ]);
      setQuotaDetail(updatedDetail);
      setPackageOverview(updatedOverview);
      type PaymentItem = { payment_type?: string; year_month?: string; created_at: string };
      const items: PaymentItem[] = Array.isArray(paymentRes?.items)
        ? (paymentRes.items as PaymentItem[])
        : ((paymentRes as { data?: { items?: PaymentItem[] } })?.data?.items ?? []);
      const contract = items
        .filter(
          (r) =>
            (r.payment_type === "contract" || r.payment_type === "renewal") && r.year_month
        )
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];
      if (contract) {
        const d = new Date(contract.created_at);
        if (!Number.isNaN(d.getTime())) setContractSigningDay(d.getDate());
      }
      await fetchTeams(currentPage);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "保存套餐失败，请稍后重试");
    } finally {
      setPackageSaving(false);
    }
  }, [
    team,
    quotaDetail,
    packagePreset,
    packageMonthlyPointsInput,
    packageDurationMonthsInput,
    fetchTeams,
    currentPage,
    setError,
  ]);

  const handleAddAdjustment = useCallback(async () => {
    if (!team || !quotaDetail) return;
    const v = selectedAmountPresets.reduce((a, b) => a + b, 0);
    if (v <= 0) {
      setError("请至少选择一个数量");
      return;
    }
    try {
      setQuotaTopupSaving(true);
      const updated = await topupTeamQuotaPoints(team.id, {
        year_month: quotaDetail.year_month,
        extra_points: v,
        type: adjustmentTypeInput,
        comment: adjustmentCommentInput.trim() || undefined,
      });
      setQuotaDetail(updated);
      setSelectedAmountPresets([]);
      setAdjustmentCommentInput("");
      const updatedOverview = await getTeamPackageOverview(team.id);
      setPackageOverview(updatedOverview);
      await fetchTeams(currentPage);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "追加积点上限失败，请稍后重试");
    } finally {
      setQuotaTopupSaving(false);
    }
  }, [
    team,
    quotaDetail,
    selectedAmountPresets,
    adjustmentTypeInput,
    adjustmentCommentInput,
    fetchTeams,
    currentPage,
    setError,
  ]);

  const handleDeleteMonthlyPlan = useCallback(async () => {
    if (!team || !quotaDetail) return;
    try {
      setDeletingMonthlyPlan(true);
      const updated = await deleteTeamMonthlyPlan(team.id, { months: 1 });
      setQuotaDetail(updated);
      const updatedOverview = await getTeamPackageOverview(team.id);
      setPackageOverview(updatedOverview);
      await fetchTeams(currentPage);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "删除该月套餐失败，请稍后重试");
    } finally {
      setDeletingMonthlyPlan(false);
    }
  }, [team, quotaDetail, fetchTeams, currentPage, setError]);

  const handleSelectMonth = useCallback(
    async (yearMonth: string) => {
      if (!team) return;
      try {
        setQuotaLoading(true);
        const detail = await getTeamQuota(team.id, { year_month: yearMonth });
        setQuotaDetail(detail);
        setSelectedYearMonth(detail.year_month);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "切换月份失败，请稍后重试");
      } finally {
        setQuotaLoading(false);
      }
    },
    [team, setError]
  );

  const currentMonthAdjustmentsSummary = useMemo(() => {
    if (!team || !quotaDetail) return { gift: 0, purchase: 0 };
    const key = `${team.id}_${quotaDetail.year_month}`;
    const list = localAdjustments[key] ?? [];
    return {
      gift: list.filter((r) => r.type === "gift").reduce((s, r) => s + r.amount, 0),
      purchase: list.filter((r) => r.type === "purchase").reduce((s, r) => s + r.amount, 0),
    };
  }, [team, quotaDetail, localAdjustments]);

  const hasPackage = useMemo(
    () =>
      !!(
        packageOverview?.start_year_month &&
        packageOverview.months.length > 0 &&
        packageOverview.months.some((m) => (m.base_points_limit ?? 0) > 0)
      ),
    [packageOverview]
  );

  useEffect(() => {
    if (!hasPackage && quotaTabValue === "cancel") {
      setQuotaTabValue("renewal");
    }
  }, [hasPackage, quotaTabValue]);

  const futureMonthsForCancel = useMemo(() => {
    if (!packageOverview) return [];
    return packageOverview.months
      .map((m) => m.year_month)
      .filter((ym) => ym >= currentYearMonth)
      .sort();
  }, [packageOverview, currentYearMonth]);

  const cancelStats = useMemo(() => {
    if (!packageOverview) return { totalMonths: 0, maxCancelMonths: 0, extraPointsSum: 0 };
    const totalMonths = packageOverview.months.length;
    const maxCancelMonths = futureMonthsForCancel.length;
    const extraPointsSum = packageOverview.months.reduce((sum, m) => {
      const base = m.base_points_limit ?? 0;
      const effective = m.effective_points_limit ?? 0;
      const rollover = m.rollover_from_prev_points ?? 0;
      return sum + Math.max(0, effective - base - rollover);
    }, 0);
    return { totalMonths, maxCancelMonths, extraPointsSum };
  }, [packageOverview, futureMonthsForCancel]);

  const handleCancelPackage = useCallback(async () => {
    if (!team || !packageOverview || !quotaDetail) return;
    const n = Number(cancelMonthsInput);
    if (Number.isNaN(n) || n <= 0) {
      setError("请输入有效的解约月数");
      return;
    }
    if (n > cancelStats.maxCancelMonths) {
      setError(`解约月数不能大于可解约月数（${cancelStats.maxCancelMonths} 个月）`);
      return;
    }
    try {
      setCancelSaving(true);
      setError("");
      await deleteTeamMonthlyPlan(team.id, { months: n });
      const updatedOverview = await getTeamPackageOverview(team.id);
      setPackageOverview(updatedOverview);

      const currentSelected = quotaDetail.year_month;
      const stillInPackage = updatedOverview.months.some((m) => m.year_month === currentSelected);
      let targetMonth = currentSelected;
      if (!stillInPackage && updatedOverview.months.length > 0) {
        const hasCurrent = updatedOverview.months.some((m) => m.year_month === currentYearMonth);
        targetMonth = hasCurrent
          ? currentYearMonth
          : (updatedOverview.end_year_month ??
            updatedOverview.months[updatedOverview.months.length - 1]?.year_month ??
            currentYearMonth);
      } else if (!stillInPackage) {
        targetMonth = currentYearMonth;
      }

      const updatedDetail = await getTeamQuota(team.id, { year_month: targetMonth });
      setQuotaDetail(updatedDetail);
      setSelectedYearMonth(targetMonth);
      setCancelMonthsInput("");
      await fetchTeams(currentPage);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "解约失败，请稍后重试");
    } finally {
      setCancelSaving(false);
    }
  }, [
    team,
    quotaDetail,
    packageOverview,
    cancelMonthsInput,
    cancelStats.maxCancelMonths,
    currentYearMonth,
    fetchTeams,
    currentPage,
    setError,
  ]);

  const canDeleteSelectedMonth = useMemo(() => {
    if (!quotaDetail || !packageOverview) return false;
    const ym = quotaDetail.year_month;
    if (ym < currentYearMonth) return false;
    const cancelableMonths = packageOverview.months
      .map((m) => m.year_month)
      .filter((m) => m >= currentYearMonth)
      .sort();
    if (!cancelableMonths.length) return false;
    return ym === cancelableMonths[cancelableMonths.length - 1];
  }, [quotaDetail, packageOverview, currentYearMonth]);

  return {
    open,
    setOpen,
    team,
    quotaDetail,
    quotaLoading,
    packageSaving,
    quotaTopupSaving,
    deletingMonthlyPlan,
    packagePreset,
    setPackagePreset,
    packageMonthlyPointsInput,
    setPackageMonthlyPointsInput,
    packageDurationMonthsInput,
    setPackageDurationMonthsInput,
    selectedAmountPresets,
    setSelectedAmountPresets,
    packageOverview,
    packageOverviewLoading,
    selectedYearMonth,
    localAdjustments,
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
    currentMonthAdjustmentsSummary,
    hasPackage,
    futureMonthsForCancel,
    cancelStats,
    canDeleteSelectedMonth,
    PACKAGE_PRESETS,
    openQuotaDialog,
    closeQuotaDialog,
    handleSavePackage,
    handleAddAdjustment,
    handleDeleteMonthlyPlan,
    handleSelectMonth,
    handleCancelPackage,
  };
}
