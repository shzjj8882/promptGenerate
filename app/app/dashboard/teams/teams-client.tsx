"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { observer } from "mobx-react-lite";
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Plus,
  Settings2,
  Users,
  Shield,
  ShieldOff,
  Search,
  Trash2,
  Copy,
  Check,
  KeyRound,
  MoreHorizontal,
  History,
} from "@/components/icons";
import {
  Team,
  TeamMember,
  resetTeamAuthcode,
  getTeamQuota,
  topupTeamQuotaTokens,
  setTeamPackage,
  deleteTeamMonthlyPlan,
  getTeamPackageOverview,
  getTeamPaymentLogs,
  type TeamPackageOverview,
  type TeamQuotaDetail,
} from "@/lib/api/teams";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { userStore } from "@/store/user-store";
import { SortIcon } from "@/components/shared/sort-icon";
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog";
import { usePagination } from "@/hooks/use-pagination";
import { ActionButtons } from "@/components/shared/action-buttons";
import { FieldHelp } from "@/components/ui/field-help";
import { useTeams } from "./hooks/use-teams";
import { useTeamForm } from "./hooks/use-team-form";
import { useTeamMembers } from "./hooks/use-team-members";
import { TeamFormDialog } from "./components/team-form-dialog";
import { cn } from "@/lib/utils";
import { UsageStatCard } from "./components/usage-stat-card";
import { QuotaHistoryDialog } from "./components/quota-history-dialog";

type TeamsClientProps = {
  initialTeams?: Team[];
  initialTotal?: number;
  initialPage?: number;
};

/** 本地 mock：Token 追加记录（赠送/购买） */
type TokenAdjustmentType = "gift" | "purchase";
interface TokenAdjustment {
  id: string;
  type: TokenAdjustmentType;
  amount: number;
  comment?: string;
  created_at: string;
}

/** YYYY-MM -> YYYY/MM/01 */
function formatYearMonthToDate(ym: string): string {
  if (!ym || ym.length < 7) return ym;
  return `${ym.slice(0, 4)}/${ym.slice(5, 7)}/01`;
}

/** YYYY-MM -> 2026年3月4日（签约日）或 2026年3月1日（默认） */
function formatYearMonthToDisplay(ym: string, signingDay?: number | null): string {
  if (!ym || ym.length < 7) return ym;
  const m = parseInt(ym.slice(5, 7), 10);
  const day = signingDay != null && signingDay >= 1 && signingDay <= 31 ? signingDay : 1;
  return `${ym.slice(0, 4)}年${m}月${day}日`;
}

/** YYYY-MM 的下一个月 YYYY-MM */
function nextYearMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

// 复制认证码组件
function AuthCodeCell({ authcode }: { authcode?: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = useCallback(async () => {
    if (!authcode) return;
    try {
      await navigator.clipboard.writeText(authcode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  }, [authcode]);
  
  if (!authcode) {
    return <span className="text-sm text-muted-foreground">未生成</span>;
  }
  
  return (
    <div className="flex items-center gap-2">
      <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
        {authcode.substring(0, 8)}...
      </code>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={handleCopy}
        title="复制认证码"
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

function TeamsClientImpl({
  initialTeams,
  initialTotal,
  initialPage = 1,
}: TeamsClientProps) {
  const [error, setError] = useState<string>("");
  const [resetAuthcodeDialogOpen, setResetAuthcodeDialogOpen] = useState(false);
  const [teamToResetAuthcode, setTeamToResetAuthcode] = useState<Team | null>(null);
  const [resetAuthcodeLoading, setResetAuthcodeLoading] = useState<string | null>(null);

  const {
    currentPage,
    setCurrentPage,
    totalCount,
    setTotalCount,
    totalPages,
  } = usePagination({
    initialPage,
    initialTotal: initialTotal ?? 0,
  });

  const { teams, loading, fetchTeams } = useTeams({
    initialTeams,
    initialTotal,
    initialPage,
    onTotalChange: setTotalCount,
  });

  const teamForm = useTeamForm({
    currentPage,
    setCurrentPage,
    teams,
    fetchTeams,
    setError,
  });
  const {
    register,
    handleSubmit,
    errors,
    isSubmitting,
    isDialogOpen,
    editingTeam,
    closeDialog,
    deleteDialogOpen,
    setDeleteDialogOpen,
    teamToDelete,
    setTeamToDelete,
    deleteLoading,
    handleCreate,
    handleEdit,
    onSubmit,
    handleDeleteClick,
    handleConfirmDelete,
  } = teamForm;

  // 创建成员变化时的回调，用于刷新团队列表
  const handleMemberChange = useCallback(() => {
    fetchTeams(currentPage);
  }, [fetchTeams, currentPage]);

  const members = useTeamMembers({
    setError,
    onMemberChange: handleMemberChange, // 成员变化时刷新团队列表
  });
  const {
    membersDialogOpen,
    setMembersDialogOpen,
    selectedTeam,
    members: membersList,
    membersLoading,
    membersPage,
    setMembersPage,
    membersTotal,
    membersTotalPages,
    memberSearchKeyword,
    handleMemberSearchChange,
    loadTeamMembers,
    handleViewMembers,
    settingAdminLoading,
    adminConfirmDialogOpen,
    setAdminConfirmDialogOpen,
    memberToUpdate,
    setMemberToUpdate,
    newAdminStatus,
    handleToggleTeamAdmin,
    handleConfirmToggleTeamAdmin,
    deleteConfirmDialogOpen,
    setDeleteConfirmDialogOpen,
    memberToDelete,
    setMemberToDelete,
    deletingUserId,
    handleDeleteMember,
    handleConfirmDeleteMember,
    createMemberDialogOpen,
    setCreateMemberDialogOpen,
    creatingMember,
    registerMember,
    handleSubmitMember,
    memberErrors,
    resetMember,
    handleCreateMember,
    onSubmitCreateMember,
    closeMembersDialog,
  } = members;

  // 配额管理对话框状态
  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false);
  const [quotaTeam, setQuotaTeam] = useState<Team | null>(null);
  const [quotaDetail, setQuotaDetail] = useState<TeamQuotaDetail | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [packageSaving, setPackageSaving] = useState(false);
  const [quotaTopupSaving, setQuotaTopupSaving] = useState(false);
  const [deletingMonthlyPlan, setDeletingMonthlyPlan] = useState(false);
  const [packagePreset, setPackagePreset] = useState<"plan1" | "plan2" | "plan3" | "custom">("plan1");
  const [packageMonthlyTokenInput, setPackageMonthlyTokenInput] = useState<string>("");
  const [packageDurationMonthsInput, setPackageDurationMonthsInput] = useState<string>("6");
  const [selectedAmountPresets, setSelectedAmountPresets] = useState<number[]>([]);
  const [packageOverview, setPackageOverview] = useState<TeamPackageOverview | null>(null);
  const [packageOverviewLoading, setPackageOverviewLoading] = useState(false);
  const [selectedYearMonth, setSelectedYearMonth] = useState<string | null>(null);
  // 本地 mock：Token 追加记录，key = `${teamId}_${yearMonth}`
  const [localAdjustments, setLocalAdjustments] = useState<Record<string, TokenAdjustment[]>>({});
  const [adjustmentTypeInput, setAdjustmentTypeInput] = useState<TokenAdjustmentType>("purchase");
  const [adjustmentCommentInput, setAdjustmentCommentInput] = useState<string>("");
  const [cancelMonthsInput, setCancelMonthsInput] = useState<string>("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [quotaHistoryDialogOpen, setQuotaHistoryDialogOpen] = useState(false);
  const [quotaTabValue, setQuotaTabValue] = useState("renewal");
  const [contractSigningDay, setContractSigningDay] = useState<number | null>(null);

  // 套餐预设：套餐一 12月 15000/月，套餐二 12月 20000/月，套餐三 12月 30000/月
  const PACKAGE_PRESETS = {
    plan1: { months: 12, monthly: 15000 },
    plan2: { months: 12, monthly: 20000 },
    plan3: { months: 12, monthly: 30000 },
  } as const;

  // 当前自然月（YYYY-MM），用于区分已发生 / 未来月份
  const currentYearMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}`;
  }, []);

  const openQuotaDialog = useCallback(
    async (team: Team) => {
      setError("");
      setQuotaTeam(team);
      setQuotaDialogOpen(true);
      setQuotaTabValue("renewal");
      setQuotaDetail(null);
      setPackageOverview(null);
      setContractSigningDay(null);
      setPackagePreset("plan1");
      setPackageMonthlyTokenInput("15000");
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
          getTeamQuota(team.id, {}),
          getTeamPackageOverview(team.id),
          getTeamPaymentLogs(team.id, { limit: 200 }),
        ]);
        setPackageOverview(overview);
        const months = overview?.months ?? [];
        const currentYm = detail.year_month;
        const isCurrentInOverview = months.some((m) => m.year_month === currentYm);
        let targetYm = currentYm;
        if (!isCurrentInOverview && months.length > 0) {
          const sorted = [...months].sort((a, b) => a.year_month.localeCompare(b.year_month));
          targetYm = currentYm < sorted[0]!.year_month
            ? sorted[0]!.year_month
            : sorted[sorted.length - 1]!.year_month;
          const targetDetail = await getTeamQuota(team.id, { year_month: targetYm });
          setQuotaDetail(targetDetail);
          setSelectedYearMonth(targetYm);
        } else {
          setQuotaDetail(detail);
          setSelectedYearMonth(currentYm);
        }
        const contract = (paymentRes?.items ?? [])
          .filter((r) => (r.payment_type === "contract" || r.payment_type === "renewal") && r.year_month)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        if (contract) {
          const d = new Date(contract.created_at);
          if (!Number.isNaN(d.getTime())) setContractSigningDay(d.getDate());
        }
      } catch (err) {
        console.error(err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("加载配额信息失败，请稍后重试");
        }
      } finally {
        setQuotaLoading(false);
        setPackageOverviewLoading(false);
      }
    },
    [setError]
  );

  const handleSavePackage = useCallback(async () => {
    if (!quotaTeam || !quotaDetail) return;
    try {
      setPackageSaving(true);
      let monthly: number;
      let duration: number;
      if (packagePreset === "custom") {
        monthly = Number(packageMonthlyTokenInput);
        if (Number.isNaN(monthly) || monthly < 0) {
          setError("每月 token 配额必须为非负数字");
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

      await setTeamPackage(quotaTeam.id, {
        monthly_token_limit: monthly,
        start_year_month: quotaDetail.year_month,
        duration_months: duration,
      });

      // 套餐更新后刷新团队列表与当前月配额详情及签约日
      const [updatedDetail, updatedOverview, paymentRes] = await Promise.all([
        getTeamQuota(quotaTeam.id, { year_month: quotaDetail.year_month }),
        getTeamPackageOverview(quotaTeam.id),
        getTeamPaymentLogs(quotaTeam.id, { limit: 200 }),
      ]);
      setQuotaDetail(updatedDetail);
      setPackageOverview(updatedOverview);
      const contract = (paymentRes?.items ?? [])
        .filter((r) => (r.payment_type === "contract" || r.payment_type === "renewal") && r.year_month)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      if (contract) {
        const d = new Date(contract.created_at);
        if (!Number.isNaN(d.getTime())) setContractSigningDay(d.getDate());
      }
      await fetchTeams(currentPage);
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("保存套餐失败，请稍后重试");
      }
    } finally {
      setPackageSaving(false);
    }
  }, [
    quotaTeam,
    quotaDetail,
    packagePreset,
    packageMonthlyTokenInput,
    packageDurationMonthsInput,
    fetchTeams,
    currentPage,
  ]);

  /** 添加 Token 追加记录：调用后端 topup + 写入本地 mock 列表 */
  const handleAddAdjustment = useCallback(async () => {
    if (!quotaTeam || !quotaDetail) return;
    const v = selectedAmountPresets.reduce((a, b) => a + b, 0);
    if (v <= 0) {
      setError("请至少选择一个数量");
      return;
    }
    try {
      setQuotaTopupSaving(true);
      const updated = await topupTeamQuotaTokens(quotaTeam.id, {
        year_month: quotaDetail.year_month,
        extra_tokens: v,
        type: adjustmentTypeInput,
        comment: adjustmentCommentInput.trim() || undefined,
      });
      setQuotaDetail(updated);
      // 后端已写入 payment_log，不再写入 localAdjustments，避免重复显示
      setSelectedAmountPresets([]);
      setAdjustmentCommentInput("");
      const updatedOverview = await getTeamPackageOverview(quotaTeam.id);
      setPackageOverview(updatedOverview);
      await fetchTeams(currentPage);
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("追加 token 上限失败，请稍后重试");
      }
    } finally {
      setQuotaTopupSaving(false);
    }
  }, [
    quotaTeam,
    quotaDetail,
    selectedAmountPresets,
    adjustmentTypeInput,
    adjustmentCommentInput,
    fetchTeams,
    currentPage,
  ]);

  const handleDeleteMonthlyPlan = useCallback(async () => {
    if (!quotaTeam || !quotaDetail) return;
    try {
      setDeletingMonthlyPlan(true);
      const updated = await deleteTeamMonthlyPlan(quotaTeam.id, {
        months: 1,
      });
      setQuotaDetail(updated);
      const updatedOverview = await getTeamPackageOverview(quotaTeam.id);
      setPackageOverview(updatedOverview);
      await fetchTeams(currentPage);
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("删除该月套餐失败，请稍后重试");
      }
    } finally {
      setDeletingMonthlyPlan(false);
    }
  }, [quotaTeam, quotaDetail, fetchTeams, currentPage]);

  // 选择某个月份作为“当前操作月份”（用于追加 token / 删除套餐等）
  const handleSelectMonth = useCallback(
    async (yearMonth: string) => {
      if (!quotaTeam) return;
      try {
        setQuotaLoading(true);
        const detail = await getTeamQuota(quotaTeam.id, { year_month: yearMonth });
        setQuotaDetail(detail);
        setSelectedYearMonth(detail.year_month);
      } catch (err) {
        console.error(err);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("切换月份失败，请稍后重试");
        }
      } finally {
        setQuotaLoading(false);
      }
    },
    [quotaTeam, setError]
  );

  /** 当前选中月份的本地追加记录汇总（用于合同卡片展示） */
  const currentMonthAdjustmentsSummary = useMemo(() => {
    if (!quotaTeam || !quotaDetail) return { gift: 0, purchase: 0 };
    const key = `${quotaTeam.id}_${quotaDetail.year_month}`;
    const list = localAdjustments[key] ?? [];
    return {
      gift: list.filter((r) => r.type === "gift").reduce((s, r) => s + r.amount, 0),
      purchase: list.filter((r) => r.type === "purchase").reduce((s, r) => s + r.amount, 0),
    };
  }, [quotaTeam, quotaDetail, localAdjustments]);

  /** 是否已有合约（存在 base_token_limit > 0 的月份；仅剩追加/赠送时不算有合约） */
  const hasPackage = useMemo(
    () =>
      !!(packageOverview?.start_year_month &&
        packageOverview.months.length > 0 &&
        packageOverview.months.some((m) => (m.base_token_limit ?? 0) > 0)),
    [packageOverview]
  );

  /** 解约最后一个后无合约时，若在解约 tab 则切回签约 */
  useEffect(() => {
    if (!hasPackage && quotaTabValue === "cancel") {
      setQuotaTabValue("renewal");
    }
  }, [hasPackage, quotaTabValue]);

  /** 可解约的月份列表（当月及未来月份） */
  const futureMonthsForCancel = useMemo(() => {
    if (!packageOverview) return [];
    return packageOverview.months
      .map((m) => m.year_month)
      .filter((ym) => ym >= currentYearMonth)
      .sort();
  }, [packageOverview, currentYearMonth]);

  /** 总合同月数、可解约最大月数、额外追加 token 总量 */
  const cancelStats = useMemo(() => {
    if (!packageOverview) return { totalMonths: 0, maxCancelMonths: 0, extraTokensSum: 0 };
    const totalMonths = packageOverview.months.length;
    const maxCancelMonths = futureMonthsForCancel.length;
    const extraTokensSum = packageOverview.months.reduce((sum, m) => {
      const base = m.base_token_limit ?? 0;
      const effective = m.effective_token_limit ?? 0;
      const rollover = m.rollover_from_prev_tokens ?? 0;
      return sum + Math.max(0, effective - base - rollover);
    }, 0);
    return { totalMonths, maxCancelMonths, extraTokensSum };
  }, [packageOverview, futureMonthsForCancel]);

  /** 解约：从最后一个未来月份起，依次删除指定月数 */
  const handleCancelPackage = useCallback(async () => {
    if (!quotaTeam || !packageOverview || !quotaDetail) return;
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
      await deleteTeamMonthlyPlan(quotaTeam.id, { months: n });
      const updatedOverview = await getTeamPackageOverview(quotaTeam.id);
      setPackageOverview(updatedOverview);

      // 解约后若当前选中月份已不在套餐内，则跳转至当前月或套餐内最新月份
      const currentSelected = quotaDetail.year_month;
      const stillInPackage = updatedOverview.months.some((m) => m.year_month === currentSelected);
      let targetMonth = currentSelected;
      if (!stillInPackage && updatedOverview.months.length > 0) {
        const hasCurrent = updatedOverview.months.some((m) => m.year_month === currentYearMonth);
        targetMonth = hasCurrent
          ? currentYearMonth
          : (updatedOverview.end_year_month ?? updatedOverview.months[updatedOverview.months.length - 1]?.year_month ?? currentYearMonth);
      } else if (!stillInPackage) {
        targetMonth = currentYearMonth;
      }

      const updatedDetail = await getTeamQuota(quotaTeam.id, { year_month: targetMonth });
      setQuotaDetail(updatedDetail);
      setSelectedYearMonth(targetMonth);
      setCancelMonthsInput("");
      await fetchTeams(currentPage);
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("解约失败，请稍后重试");
      }
    } finally {
      setCancelSaving(false);
    }
  }, [
    quotaTeam,
    quotaDetail,
    packageOverview,
    cancelMonthsInput,
    cancelStats.maxCancelMonths,
    currentYearMonth,
    fetchTeams,
    currentPage,
  ]);

  // 是否允许删除当前选中的月份套餐：必须是当月或未来月份，且是可解约月份中最后一个
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

  // Data Table 状态
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ search: false });

  const renderSortIcon = useCallback((sorted: false | "asc" | "desc") => {
    return <SortIcon sorted={sorted} />;
  }, []);

  useEffect(() => {
    if (initialTeams && initialTeams.length > 0 && currentPage === initialPage) {
      return;
    }
    fetchTeams(currentPage);
  }, [currentPage, initialTeams, initialPage, fetchTeams]);

  useEffect(() => {
    if (membersDialogOpen && selectedTeam && membersPage > 0) {
      loadTeamMembers(selectedTeam.id, membersPage, memberSearchKeyword);
    }
  }, [membersPage, membersDialogOpen, selectedTeam, memberSearchKeyword, loadTeamMembers]);

  const handleResetAuthcodeClick = useCallback((team: Team) => {
    setTeamToResetAuthcode(team);
    setResetAuthcodeDialogOpen(true);
  }, []);

  const handleConfirmResetAuthcode = useCallback(async () => {
    if (!teamToResetAuthcode) return;
    try {
      setResetAuthcodeLoading(teamToResetAuthcode.id);
      await resetTeamAuthcode(teamToResetAuthcode.id);
      setResetAuthcodeDialogOpen(false);
      setTeamToResetAuthcode(null);
      setError("");
      await fetchTeams(currentPage);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("重置认证码失败，请稍后重试");
      }
    } finally {
      setResetAuthcodeLoading(null);
    }
  }, [teamToResetAuthcode, currentPage, fetchTeams]);

  const columns = useMemo<ColumnDef<Team>[]>(
    () => [
      // 用于全局搜索（代码/名称），隐藏不展示
      {
        id: "search",
        accessorFn: (row) => `${row.code} ${row.name}`,
        enableSorting: false,
        enableHiding: false,
        filterFn: "includesString",
        header: () => null,
        cell: () => null,
      },
      {
        id: "quota",
        header: "本月配额",
        cell: ({ row }) => {
          const t = row.original;
          const ym = t.current_month_year_month ?? "";
          const tokenLimit =
            t.current_month_token_limit !== null && t.current_month_token_limit !== undefined
              ? t.current_month_token_limit
              : null;
          return (
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex items-center gap-1">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {ym || "本月"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-muted-foreground">
                  Token:{" "}
                  <span className="font-medium text-foreground">
                    {t.current_month_tokens_used ?? 0}
                  </span>
                  {tokenLimit && tokenLimit > 0 ? (
                    <>
                      {" / "}
                      <span className="font-medium text-foreground">{tokenLimit}</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">（不限）</span>
                  )}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "code",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            团队代码
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="font-mono text-sm">{row.original.code}</div>
        ),
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            团队名称
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
      },
      {
        accessorKey: "member_count",
        header: "成员数量",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{row.original.member_count ?? 0}</span>
          </div>
        ),
      },
      {
        accessorKey: "authcode",
        header: "API 认证码",
        cell: ({ row }) => <AuthCodeCell authcode={row.original.authcode} />,
      },
      {
        accessorKey: "is_active",
        header: "状态",
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? "default" : "secondary"}>
            {row.original.is_active ? "激活" : "禁用"}
          </Badge>
        ),
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            创建时间
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => {
          const date = new Date(row.original.created_at);
          return (
            <div className="text-sm text-muted-foreground">
              {date.toLocaleString("zh-CN")}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">操作</div>,
        cell: ({ row }) => {
          const team = row.original;
          return (
            <ActionButtons
              onEdit={() => handleEdit(team)}
              onDelete={() => handleDeleteClick(team)}
              canEdit={true}
              canDelete={true}
              deleteLoading={deleteLoading === team.id}
              variant="dropdown"
              additionalActions={[
                {
                  label: "查看成员",
                  icon: <Users className="h-4 w-4" />,
                  onClick: () => handleViewMembers(team),
                },
                {
                  label: "重置认证码",
                  icon: <KeyRound className="h-4 w-4" />,
                  onClick: () => handleResetAuthcodeClick(team),
                },
                {
                  label: "管理配额",
                  icon: <Settings2 className="h-4 w-4" />,
                  onClick: () => openQuotaDialog(team),
                },
              ]}
            />
          );
        },
      },
    ],
    [deleteLoading, handleResetAuthcodeClick, handleViewMembers, openQuotaDialog]
  );

  const table = useReactTable({
    data: teams,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // 计算总页数

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title="团队管理"
        description="管理系统中的所有团队（仅超级管理员可见）"
        action={null}
      />

      {/* 列表 + 分页：中间可滚动，分页固定在底部 */}
      <div className="flex flex-1 min-h-0 flex-col gap-4">
        {/* 顶部工具栏（搜索等） */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <Input
              placeholder="搜索团队（代码 / 名称）..."
              value={(table.getColumn("search")?.getFilterValue() as string) ?? ""}
              onChange={(event) => table.getColumn("search")?.setFilterValue(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button size="sm" className="h-9" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              新建团队
            </Button>
          </div>
        </div>

        {/* 团队列表 - 卡片形式 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="pb-2">
                    <div className="h-5 w-24 bg-muted rounded" />
                    <div className="h-4 w-32 bg-muted rounded mt-2" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="h-4 bg-muted rounded w-full" />
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !table.getRowModel().rows?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-muted-foreground">暂无团队数据</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {table.getRowModel().rows.map((row) => {
                const team = row.original;
                return (
                  <Card key={team.id} className="flex flex-col">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base font-mono">{team.code}</CardTitle>
                          <p className="text-sm font-medium text-foreground mt-0.5">{team.name}</p>
                        </div>
                        <ActionButtons
                          onEdit={() => handleEdit(team)}
                          onDelete={() => handleDeleteClick(team)}
                          canEdit={true}
                          canDelete={true}
                          deleteLoading={deleteLoading === team.id}
                          variant="dropdown"
                          additionalActions={[
                            {
                              label: "查看成员",
                              icon: <Users className="h-4 w-4" />,
                              onClick: () => handleViewMembers(team),
                            },
                            {
                              label: "管理配额",
                              icon: <Settings2 className="h-4 w-4" />,
                              onClick: () => openQuotaDialog(team),
                            },
                            { type: "separator" },
                            {
                              label: "复制认证码",
                              icon: <Copy className="h-4 w-4" />,
                              onClick: async () => {
                                if (team.authcode) {
                                  await navigator.clipboard.writeText(team.authcode);
                                }
                              },
                            },
                            {
                              label: "重置认证码",
                              icon: <KeyRound className="h-4 w-4" />,
                              onClick: () => handleResetAuthcodeClick(team),
                            },
                          ]}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-3 pt-0">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4 shrink-0" />
                        <span>成员：{team.member_count ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={team.plan_expire_at && new Date(team.plan_expire_at) > new Date() ? "default" : "outline"}
                          className="text-xs"
                        >
                          {team.plan_expire_at && new Date(team.plan_expire_at) > new Date() ? "有合约" : "无合约"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {!loading && teams.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            onPageChange={setCurrentPage}
            disabled={loading}
          />
        )}
      </div>

      {/* 创建/编辑对话框 */}
      <TeamFormDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        editingTeam={editingTeam}
        register={register}
        errors={errors}
        isSubmitting={isSubmitting}
        onSubmit={onSubmit}
        handleSubmit={handleSubmit}
        error={error}
        onClose={closeDialog}
      />

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setError("");
          }
        }}
        title="确认删除"
        description={`确定要删除团队 ${teamToDelete?.name || ""} 吗？`}
        onConfirm={handleConfirmDelete}
        loading={!!deleteLoading}
      />

      {/* 重置认证码确认对话框 */}
      <DeleteConfirmDialog
        open={resetAuthcodeDialogOpen}
        onOpenChange={(open) => {
          setResetAuthcodeDialogOpen(open);
          if (!open) {
            setError("");
            setTeamToResetAuthcode(null);
          }
        }}
        title="确认重置认证码"
        description={`确定要重置团队 ${teamToResetAuthcode?.name || ""} 的 API 认证码吗？重置后，旧的认证码将立即失效，请确保已通知相关使用方更新认证码。`}
        onConfirm={handleConfirmResetAuthcode}
        loading={resetAuthcodeLoading === teamToResetAuthcode?.id}
      />

      {/* 团队成员对话框 */}
      <Dialog
        open={membersDialogOpen}
        onOpenChange={(open) => {
          setMembersDialogOpen(open);
          if (!open) closeMembersDialog();
        }}
      >
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              团队成员 - {selectedTeam?.name}
            </DialogTitle>
            <DialogDescription>
              团队代码: {selectedTeam?.code}
            </DialogDescription>
          </DialogHeader>

          {/* 搜索框和创建按钮 */}
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索成员（用户名、邮箱、全名）"
                value={memberSearchKeyword}
                onChange={(e) => handleMemberSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
            {userStore.user?.is_superuser && (
              <Button onClick={handleCreateMember} size="sm" className="h-9">
                <Plus className="mr-2 h-4 w-4" />
                创建账号
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {membersLoading ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                加载中...
              </div>
            ) : membersList.length > 0 ? (
              <div className="space-y-2">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>用户名</TableHead>
                      <TableHead>邮箱</TableHead>
                      <TableHead>全名</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead>状态</TableHead>
                      {userStore.user?.is_superuser && (
                        <TableHead className="text-right">操作</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {membersList.map((member: TeamMember) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.username}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{member.email}</TableCell>
                        <TableCell>{member.full_name || "-"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {member.is_superuser && (
                              <Badge variant="default">超级管理员</Badge>
                            )}
                            {member.is_team_admin && (
                              <Badge variant="secondary">团队管理员</Badge>
                            )}
                            {!member.is_superuser && !member.is_team_admin && (
                              <Badge variant="outline">成员</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={member.is_active ? "default" : "secondary"}>
                            {member.is_active ? "激活" : "禁用"}
                          </Badge>
                        </TableCell>
                        {userStore.user?.is_superuser && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {!member.is_superuser && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleTeamAdmin(member)}
                                    disabled={settingAdminLoading === member.id || deletingUserId === member.id}
                                    className="h-8"
                                  >
                                    {member.is_team_admin ? (
                                      <>
                                        <ShieldOff className="mr-2 h-4 w-4" />
                                        取消管理员
                                      </>
                                    ) : (
                                      <>
                                        <Shield className="mr-2 h-4 w-4" />
                                        设为管理员
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteMember(member)}
                                    disabled={deletingUserId === member.id}
                                    className="h-8 text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    删除
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={userStore.user?.is_superuser ? 6 : 5}
                      className="h-24 text-center text-sm text-muted-foreground"
                    >
                      该团队暂无成员
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </div>

          {!membersLoading && membersTotal > 0 && (
            <div className="mt-4">
              <Pagination
                currentPage={membersPage}
                totalPages={membersTotalPages}
                totalCount={membersTotal}
                onPageChange={(page) => {
                  setMembersPage(page);
                }}
                disabled={membersLoading}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 设置团队管理员确认对话框 */}
      <AlertDialog
        open={adminConfirmDialogOpen}
        onOpenChange={(open) => {
          setAdminConfirmDialogOpen(open);
          if (!open) {
            setMemberToUpdate(null);
            setError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认操作</AlertDialogTitle>
            <AlertDialogDescription className="text-base space-y-3">
              <div>
                确定要{newAdminStatus ? "设置" : "取消"}用户{" "}
                <span className="font-semibold text-foreground">
                  {memberToUpdate?.username}
                </span>{" "}
                为团队管理员吗？
              </div>
              {newAdminStatus && (
                <div className="rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    设置为团队管理员后，该用户将可以：
                  </p>
                  <ul className="text-xs text-blue-700 dark:text-blue-300 mt-1 list-disc list-inside">
                    <li>管理自己团队内的成员</li>
                    <li>设置权限管理（RBAC）</li>
                    <li>查看和管理自己团队的数据</li>
                  </ul>
                </div>
              )}
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!settingAdminLoading}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmToggleTeamAdmin}
              disabled={!!settingAdminLoading}
              className={newAdminStatus ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              {settingAdminLoading ? "处理中..." : "确认"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除成员确认对话框 */}
      <DeleteConfirmDialog
        open={deleteConfirmDialogOpen}
        onOpenChange={(open) => {
          setDeleteConfirmDialogOpen(open);
          if (!open) {
            setMemberToDelete(null);
            setError("");
          }
        }}
        title="确认删除"
        description={
          <>
            确定要删除用户{" "}
            <span className="font-semibold text-foreground">
              {memberToDelete?.username}
            </span>{" "}
            吗？
          </>
        }
        warningMessage={
          <>
            <p className="text-sm text-destructive">
              ⚠️ 此操作不可恢复！删除用户将同时删除：
            </p>
            <ul className="text-xs text-destructive/80 mt-1 list-disc list-inside">
              <li>用户账户</li>
              <li>用户的所有角色关联</li>
            </ul>
          </>
        }
        error={error}
        onConfirm={handleConfirmDeleteMember}
        loading={!!deletingUserId}
      />

      {/* 创建成员对话框 */}
      <Dialog
        open={createMemberDialogOpen}
        onOpenChange={(open) => {
          setCreateMemberDialogOpen(open);
          if (!open) {
            resetMember();
            setError("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>创建团队成员</DialogTitle>
            <DialogDescription>
              为团队 {selectedTeam?.name} 创建新账号
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitMember(onSubmitCreateMember)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="member-username">用户名 *</Label>
              <Input
                id="member-username"
                placeholder="请输入用户名"
                {...registerMember("username")}
                className={memberErrors.username ? "border-destructive" : ""}
              />
              {memberErrors.username && (
                <p className="text-sm text-destructive">{memberErrors.username.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-email">邮箱 *</Label>
              <Input
                id="member-email"
                type="email"
                placeholder="请输入邮箱"
                {...registerMember("email")}
                className={memberErrors.email ? "border-destructive" : ""}
              />
              {memberErrors.email && (
                <p className="text-sm text-destructive">{memberErrors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-password">密码 *</Label>
              <PasswordInput
                id="member-password"
                placeholder="请输入密码（至少6个字符）"
                {...registerMember("password")}
                className={memberErrors.password ? "border-destructive" : ""}
              />
              {memberErrors.password && (
                <p className="text-sm text-destructive">{memberErrors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-fullName">全名（可选）</Label>
              <Input
                id="member-fullName"
                placeholder="请输入全名"
                {...registerMember("fullName")}
                className={memberErrors.fullName ? "border-destructive" : ""}
              />
              {memberErrors.fullName && (
                <p className="text-sm text-destructive">{memberErrors.fullName.message}</p>
              )}
            </div>

            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <p>团队代码: <span className="font-semibold text-foreground">{selectedTeam?.code}</span></p>
              <p className="mt-1 text-xs">新账号将自动加入该团队</p>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateMemberDialogOpen(false)}
                disabled={creatingMember}
              >
                取消
              </Button>
              <Button type="submit" disabled={creatingMember}>
                {creatingMember ? "创建中..." : "创建"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 团队配额管理对话框 */}
      <Dialog
        open={quotaDialogOpen}
        onOpenChange={(open) => {
          setQuotaDialogOpen(open);
          if (!open) {
            setQuotaTeam(null);
            setQuotaDetail(null);
            setPackageMonthlyTokenInput("");
            setPackageDurationMonthsInput("6");
            setSelectedAmountPresets([]);
            setError("");
          }
        }}
      >
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
            <Tabs value={quotaTabValue} onValueChange={setQuotaTabValue} className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {/* 用量统计 - 无边框，移动端不展示 */}
              <div className="hidden sm:block space-y-3 shrink-0">
                {hasPackage ? (
                (() => {
                  const monthData = packageOverview?.months.find((m) => m.year_month === quotaDetail.year_month);
                  const rollover = monthData?.rollover_from_prev_tokens ?? 0;
                  const cardCount = rollover > 0 ? 3 : 2;
                  const baseLimit = monthData?.base_token_limit ?? 0;
                  // 赠送/购买通用月份：分配与总额均用套餐内通用值（当月为 0 时取首个有值的月份）
                  let giftTokens = monthData?.gift_tokens ?? 0;
                  let extraTokens = monthData?.extra_tokens ?? 0;
                  if (giftTokens + extraTokens === 0 && (packageOverview?.months?.length ?? 0) > 0) {
                    const firstWithTopup = packageOverview!.months.find(
                      (m) => (m.gift_tokens ?? 0) + (m.extra_tokens ?? 0) > 0
                    );
                    if (firstWithTopup) {
                      giftTokens = firstWithTopup.gift_tokens ?? 0;
                      extraTokens = firstWithTopup.extra_tokens ?? 0;
                    }
                  }
                  const tokensUsed = quotaDetail.tokens_used;
                  // 优先使用后端记录的分项（按优先级持久化），否则前端推算
                  const hasRecorded =
                    (monthData?.gift_tokens_used ?? 0) +
                    (monthData?.rollover_tokens_used ?? 0) +
                    (monthData?.base_tokens_used ?? 0) +
                    (monthData?.extra_tokens_used ?? 0) ===
                    tokensUsed;
                  const giftUsed = hasRecorded
                    ? (monthData?.gift_tokens_used ?? 0)
                    : Math.min(tokensUsed, giftTokens);
                  const rolloverUsed = hasRecorded
                    ? (monthData?.rollover_tokens_used ?? 0)
                    : Math.min(tokensUsed - giftUsed, rollover);
                  const baseUsed = hasRecorded
                    ? (monthData?.base_tokens_used ?? 0)
                    : Math.min(tokensUsed - giftUsed - rolloverUsed, baseLimit);
                  const extraUsed = hasRecorded
                    ? (monthData?.extra_tokens_used ?? 0)
                    : tokensUsed - giftUsed - rolloverUsed - baseUsed;
                  const outOfPackageUsed = giftUsed + extraUsed;
                  const outOfPackageTotal = giftTokens + extraTokens;
                  const giftRemaining = Math.max(0, giftTokens - giftUsed);
                  const purchaseRemaining = Math.max(0, extraTokens - extraUsed);
                  return (
                      <div
                        className={cn(
                          "grid gap-4 items-stretch",
                          cardCount === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"
                        )}
                      >
                        <UsageStatCard
                          title="套餐状态"
                          value={
                            <span className="flex items-baseline gap-1">
                              <span className="text-2xl font-bold">{baseUsed.toLocaleString()}</span>
                              <span className="text-sm font-normal text-muted-foreground">
                                / {baseLimit.toLocaleString()}
                              </span>
                            </span>
                          }
                          badge={formatYearMonthToDisplay(quotaDetail.year_month, contractSigningDay)}
                          contextText="已使用 / 套餐总数"
                        />
                        <UsageStatCard
                          title="套餐外额度"
                          value={
                            <span className="flex items-baseline gap-1">
                              <span className="text-2xl font-bold">{outOfPackageUsed.toLocaleString()}</span>
                              <span className="text-sm font-normal text-muted-foreground">
                                / {outOfPackageTotal.toLocaleString()}
                              </span>
                            </span>
                          }
                          contextText="已使用/总套餐外额度"
                          contextHelp={
                            (giftRemaining > 0 || purchaseRemaining > 0)
                              ? [
                                  giftRemaining > 0 && `赠送剩余 ${giftRemaining.toLocaleString()}（优先消耗）`,
                                  purchaseRemaining > 0 && `购买剩余 ${purchaseRemaining.toLocaleString()}`,
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
                                <span className="text-2xl font-bold">{rolloverUsed.toLocaleString()}</span>
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
                    const monthData = packageOverview?.months.find((m) => m.year_month === quotaDetail.year_month);
                    let giftTokens = monthData?.gift_tokens ?? 0;
                    let extraTokens = monthData?.extra_tokens ?? 0;
                    if (giftTokens + extraTokens === 0 && (packageOverview?.months?.length ?? 0) > 0) {
                      const firstWithTopup = packageOverview!.months.find(
                        (m) => (m.gift_tokens ?? 0) + (m.extra_tokens ?? 0) > 0
                      );
                      if (firstWithTopup) {
                        giftTokens = firstWithTopup.gift_tokens ?? 0;
                        extraTokens = firstWithTopup.extra_tokens ?? 0;
                      }
                    }
                    const tokensUsed = quotaDetail.tokens_used;
                    const outOfPackageTotal = giftTokens + extraTokens;
                    const outOfPackageUsed = Math.min(tokensUsed, outOfPackageTotal);
                    const giftRemaining = Math.max(0, giftTokens - Math.min(tokensUsed, giftTokens));
                    const purchaseRemaining = Math.max(0, extraTokens - Math.min(Math.max(0, tokensUsed - giftTokens), extraTokens));
                    return (
                      <UsageStatCard
                        title="套餐外额度"
                        value={
                          <span className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold">{outOfPackageUsed.toLocaleString()}</span>
                            <span className="text-sm font-normal text-muted-foreground">
                              / {outOfPackageTotal > 0 ? outOfPackageTotal.toLocaleString() : "0"}
                            </span>
                          </span>
                        }
                        contextText="总额度 = 赠送 + 购买"
                        contextHelp={
                          (giftRemaining > 0 || purchaseRemaining > 0)
                            ? [
                                giftRemaining > 0 && `赠送剩余 ${giftRemaining.toLocaleString()}（优先消耗）`,
                                purchaseRemaining > 0 && `购买剩余 ${purchaseRemaining.toLocaleString()}`,
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
                <TabsList className={cn("grid w-full sm:w-fit shrink-0", hasPackage ? "grid-cols-3 sm:max-w-[300px]" : "grid-cols-2 sm:max-w-[200px]")}>
                  <TabsTrigger value="renewal">{hasPackage ? "续约" : "签约"}</TabsTrigger>
                  <TabsTrigger value="topup">追加</TabsTrigger>
                  {hasPackage && <TabsTrigger value="cancel">解约</TabsTrigger>}
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
                  {quotaDetail && hasPackage && packageOverview && packageOverview.months.length > 0 && (
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
                          const filtered = packageOverview.months.filter((m) => m.year_month >= currentYearMonth);
                          const monthsToShow = filtered.length > 0 ? filtered : packageOverview.months;
                          return monthsToShow.map((m) => {
                            const isFuture = m.year_month > currentYearMonth;
                            return (
                              <SelectItem
                                key={m.year_month}
                                value={m.year_month}
                                disabled={!isFuture && m.year_month !== currentYearMonth}
                              >
                                {formatYearMonthToDisplay(m.year_month, contractSigningDay)}
                              </SelectItem>
                            );
                          });
                        })()}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <TabsContent value="renewal" className="mt-4 data-[state=inactive]:hidden flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
                <div className="flex flex-col flex-1 min-h-0 pb-0">
                  {/* 配置卡片 */}
                  <Card className="shadow-sm flex-1 flex flex-col min-h-0">
                    <CardHeader className="pb-3 shrink-0">
                      <CardTitle className="text-base font-semibold">套餐配置</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-0 flex-1 min-h-0">
                      <div className="space-y-2 shrink-0">
                        <Label className="text-sm font-medium">选择套餐</Label>
                        <Select
                          value={packagePreset}
                          onValueChange={(v) => {
                            const key = v as "plan1" | "plan2" | "plan3" | "custom";
                            setPackagePreset(key);
                            if (key !== "custom") {
                              const p = PACKAGE_PRESETS[key];
                              setPackageMonthlyTokenInput(String(p.monthly));
                              setPackageDurationMonthsInput(String(p.months));
                            }
                          }}
                        >
                          <SelectTrigger className="w-full sm:w-[220px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="plan1">套餐一 12月 每月15000</SelectItem>
                            <SelectItem value="plan2">套餐二 12月 每月20000</SelectItem>
                            <SelectItem value="plan3">套餐三 12月 每月30000</SelectItem>
                            <SelectItem value="custom">自定义</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {packagePreset === "custom" && (
                        <>
                          <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
                            <div className="space-y-2 shrink-0">
                              <Label htmlFor="package-monthly-tokens" className="text-sm font-medium">每月套餐 token 配额</Label>
                              <Input
                                id="package-monthly-tokens"
                                type="number"
                                min={0}
                                placeholder="例如：30000（0 表示不限）"
                                value={packageMonthlyTokenInput}
                                onChange={(e) => setPackageMonthlyTokenInput(e.target.value)}
                                className="max-w-[200px]"
                              />
                            </div>
                            <div className="space-y-1 shrink-0">
                              <Label htmlFor="package-duration-months" className="text-sm font-medium">套餐持续月份</Label>
                              <Input
                                id="package-duration-months"
                                type="number"
                                min={1}
                                max={60}
                                placeholder="例如：6"
                                value={packageDurationMonthsInput}
                                onChange={(e) => setPackageDurationMonthsInput(e.target.value)}
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

              <TabsContent value="topup" className="mt-4 data-[state=inactive]:hidden flex flex-col flex-1 min-h-0">
                <div className="flex flex-col gap-5 flex-1 min-h-0">
              {/* 本月 token 追加数据 */}
              <Card className="shadow-sm flex-1 flex flex-col min-h-0">
                <CardHeader className="pb-3 shrink-0">
                  <CardTitle className="text-base font-semibold">本月 token 追加数据</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col flex-1 min-h-0 pt-0 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">类型</Label>
                      <Select
                        value={adjustmentTypeInput}
                        onValueChange={(v) => setAdjustmentTypeInput(v as TokenAdjustmentType)}
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
                      <Label className="text-sm font-medium">数量</Label>
                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                        {[5000, 10000, 15000, 20000].map((n) => {
                          const isSelected = selectedAmountPresets.includes(n);
                          return (
                            <Button
                              key={n}
                              type="button"
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              className="h-9 w-full sm:w-auto sm:min-w-[72px] tabular-nums"
                              onClick={() => {
                                setSelectedAmountPresets((prev) =>
                                  prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
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
                    <Label htmlFor="adjustment-comment" className="text-sm font-medium">备注</Label>
                    <Textarea
                      id="adjustment-comment"
                      placeholder="备注说明，支持换行"
                      value={adjustmentCommentInput}
                      onChange={(e) => setAdjustmentCommentInput(e.target.value)}
                      className="min-h-[100px] max-h-[200px] resize-y w-full overflow-y-auto custom-scrollbar"
                      rows={4}
                    />
                  </div>
                </CardContent>
              </Card>
                </div>
              </TabsContent>

              {hasPackage && (
                <TabsContent value="cancel" className="mt-4 data-[state=inactive]:hidden flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
                  <div className="flex flex-col flex-1 min-h-0 pb-0">
                    <Card className="shadow-sm flex-1 flex flex-col min-h-0">
                      <CardHeader className="pb-3 shrink-0">
                        <CardTitle className="text-base font-semibold">解除续约</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          解除当月及未来月份的套餐配置，数量不得大于总合同数量。从最后一个月开始解约。
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-0 flex-1 min-h-0">
                        <div className="space-y-2 shrink-0">
                          <p className="text-sm text-muted-foreground">
                            总合同：<span className="font-medium text-foreground">{cancelStats.totalMonths}</span> 个月
                            {packageOverview?.start_year_month && packageOverview?.end_year_month && (
                              <span className="text-muted-foreground">
                                （{formatYearMonthToDisplay(packageOverview.start_year_month, contractSigningDay)} 至 {formatYearMonthToDisplay(packageOverview.end_year_month, contractSigningDay)}）
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            可解约：最多 <span className="font-medium text-foreground">{cancelStats.maxCancelMonths}</span> 个月
                          </p>
                          {cancelStats.extraTokensSum > 0 && (
                            <p className="text-sm text-muted-foreground">
                              额外追加 token 总量：<span className="font-medium text-foreground tabular-nums">{cancelStats.extraTokensSum.toLocaleString()}</span>
                            </p>
                          )}
                        </div>
                        <div className="space-y-2 shrink-0">
                          <Label htmlFor="cancel-months" className="text-sm font-medium">解约月数</Label>
                          <Input
                            id="cancel-months"
                            type="number"
                            min={1}
                            max={cancelStats.maxCancelMonths}
                            placeholder={cancelStats.maxCancelMonths > 0 ? `1 ~ ${cancelStats.maxCancelMonths}` : "无可解约月份"}
                            value={cancelMonthsInput}
                            onChange={(e) => setCancelMonthsInput(e.target.value)}
                            className="max-w-[200px]"
                          />
                          <p className="text-xs text-muted-foreground">
                            解约月数不得大于 {cancelStats.maxCancelMonths} 个月。
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              )}
              </div>
              {/* 解约二次确认 */}
              <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
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
                (quotaTabValue === "topup" || quotaTabValue === "renewal") && "sm:justify-between"
              )}
            >
              {quotaTabValue === "renewal" && (
                <>
                  <span className="text-sm text-muted-foreground order-2 sm:order-1 flex items-center gap-1">
                    {packagePreset === "custom" ? (
                      <>从 {formatYearMonthToDisplay(quotaDetail?.year_month ?? "", contractSigningDay)} 开始，连续 {packageDurationMonthsInput || "0"} 个月</>
                    ) : (
                      <>
                        {packagePreset === "plan1" && "12 个月，每月 15,000 token"}
                        {packagePreset === "plan2" && "12 个月，每月 20,000 token"}
                        {packagePreset === "plan3" && "12 个月，每月 30,000 token"}
                      </>
                    )}
                    <FieldHelp content={'套餐会从当前月份开始，按"每月基础配额 + 结转 + 追加"计算有效额度。'} />
                  </span>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 order-1 sm:order-2">
                    {packagePreset === "custom" && (
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          setPackageMonthlyTokenInput("");
                          setPackageDurationMonthsInput("6");
                        }}
                      >
                        重置
                      </Button>
                    )}
                    <Button className="w-full sm:w-auto" onClick={handleSavePackage} disabled={packageSaving}>
                      {packageSaving ? "保存中..." : "保存套餐"}
                    </Button>
                  </div>
                </>
              )}
              {quotaTabValue === "topup" && (
                <>
                  <span className="text-sm text-muted-foreground order-2 sm:order-1">
                    合计：<span className="font-semibold text-foreground tabular-nums">
                      {selectedAmountPresets.length > 0
                        ? selectedAmountPresets.reduce((a, b) => a + b, 0).toLocaleString()
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
                        setError(`解约月数不能大于可解约月数（${cancelStats.maxCancelMonths} 个月）`);
                        return;
                      }
                      setError("");
                      setCancelConfirmOpen(true);
                    }}
                    disabled={cancelSaving || cancelStats.maxCancelMonths === 0}
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

      {/* 缴费历史记录对话框 */}
      <QuotaHistoryDialog
        open={quotaHistoryDialogOpen}
        onOpenChange={setQuotaHistoryDialogOpen}
        teamId={quotaTeam?.id}
        teamName={quotaTeam?.name}
        localAdjustments={localAdjustments}
        packageOverview={packageOverview}
      />
    </div>
  );
}

export default observer(TeamsClientImpl);
