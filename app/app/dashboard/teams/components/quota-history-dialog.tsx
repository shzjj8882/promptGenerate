"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { ChevronDown, History } from "@/components/icons";
import { getTeamPaymentLogs, type TeamPackageOverview } from "@/lib/api/teams";
import type { MultiDimensionTable, TableRow } from "@/lib/api/multi-dimension-tables";

const TableCanvasView = dynamic(
  () => import("@/app/dashboard/config/tables/components").then((m) => ({ default: m.TableCanvasView })),
  { ssr: false }
);

type TokenAdjustmentType = "gift" | "purchase";
interface TokenAdjustment {
  id: string;
  type: TokenAdjustmentType;
  amount: number;
  comment?: string;
  created_at: string;
}

function formatYearMonthToDisplay(ym: string): string {
  if (!ym || ym.length < 7) return ym;
  const m = parseInt(ym.slice(5, 7), 10);
  return `${ym.slice(0, 4)}年${m}月1日`;
}

/** 签约/续约显示合约日期（实际操作日期）；解约显示被解约月份的合约日期（月份+签约日，如签约3月4日则解约3月=3月4日、解约4月=4月4日）；赠送、追加无合约日期显示 "-" */
function formatPaymentDateForDisplay(
  paymentType: string,
  yearMonth: string,
  createdAt: string,
  contractSigningDay?: number | null
): string {
  if (yearMonth === "-") return "-";
  if (paymentType === "cancel" && yearMonth && /^\d{4}-\d{2}$/.test(yearMonth) && contractSigningDay != null) {
    const y = yearMonth.slice(0, 4);
    const m = parseInt(yearMonth.slice(5, 7), 10);
    return `${y}年${m}月${contractSigningDay}日`;
  }
  if (paymentType === "contract" || paymentType === "renewal") {
    const d = new Date(createdAt);
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
  }
  return "-";
}

/** 解约备注：格式化为 "解约 YYYY年M月D日"（与合约日期一致，如解约 2026-03 且签约日=4 → 解约 2026年3月4日） */
function formatPaymentCommentForDisplay(
  paymentType: string,
  comment: string | undefined,
  yearMonth: string,
  contractSigningDay?: number | null
): string {
  if (!comment || comment === "-") return "-";
  if (paymentType === "cancel" && yearMonth && /^\d{4}-\d{2}$/.test(yearMonth) && contractSigningDay != null) {
    const y = yearMonth.slice(0, 4);
    const m = parseInt(yearMonth.slice(5, 7), 10);
    return `解约 ${y}年${m}月${contractSigningDay}日`;
  }
  return comment;
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  gift: "赠送",
  purchase: "追加",
  renewal: "签约/续约",
  contract: "签约/续约",
  cancel: "解约",
};

/** 类型枚举选项（多选） */
const PAYMENT_TYPE_OPTIONS = [
  { value: "gift", label: "赠送" },
  { value: "purchase", label: "追加" },
  { value: "contract", label: "签约/续约" },
  { value: "cancel", label: "解约" },
] as const;

interface QuotaHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId?: string;
  teamName?: string;
  localAdjustments: Record<string, TokenAdjustment[]>;
  packageOverview: TeamPackageOverview | null;
}

export function QuotaHistoryDialog({
  open,
  onOpenChange,
  teamId,
  teamName,
  localAdjustments,
  packageOverview,
}: QuotaHistoryDialogProps) {
  const [usageSelectedMonth, setUsageSelectedMonth] = useState<string | null>(null);
  const [usageSelectedDate, setUsageSelectedDate] = useState<Date | undefined>(undefined);
  const [tableReady, setTableReady] = useState(false);
  const [paymentLogs, setPaymentLogs] = useState<Array<{
    id: string;
    payment_type: string;
    year_month: string | null;
    amount: number;
    comment: string | null;
    created_at: string;
  }>>([]);

  useEffect(() => {
    if (!open || !teamId) {
      setPaymentLogs([]);
      return;
    }
    getTeamPaymentLogs(teamId, { limit: 200 })
      .then((res) => setPaymentLogs(res?.items ?? []))
      .catch(() => setPaymentLogs([]));
  }, [open, teamId, packageOverview]);

  /** 缴费记录多维表格的列定义（与 TableCanvasView 所需格式一致） */
  const PAYMENT_TABLE_COLUMNS = useMemo(
    () => [
      {
        key: "type",
        label: "操作类型",
        type: "single_select",
        options: { options: ["赠送", "追加", "签约/续约", "解约"] },
      },
      { key: "year_month", label: "合约日期", type: "text" },
      { key: "amount", label: "数量（Token/月数）", type: "number" },
      { key: "comment", label: "备注说明", type: "text" },
      { key: "created_at", label: "操作时间", type: "text" },
    ],
    []
  );

  /** 缴费记录多维表格元信息（供 TableCanvasView 使用，使用唯一 id 避免与 localStorage 冲突） */
  const paymentTable: MultiDimensionTable = useMemo(
    () => ({
      id: "team-quota-payment-logs",
      code: "team-quota-payment-logs",
      name: "缴费记录",
      columns: PAYMENT_TABLE_COLUMNS,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    [PAYMENT_TABLE_COLUMNS]
  );

  const paymentRecordsList = useMemo(() => {
    const list: Array<{
      id: string;
      payment_type: string;
      year_month: string;
      amount: number;
      comment?: string;
      created_at: string;
    }> = [];
    paymentLogs.forEach((log) => {
      list.push({
        id: log.id,
        payment_type: log.payment_type,
        year_month: log.year_month || "-",
        amount: log.amount,
        comment: log.comment || undefined,
        created_at: log.created_at,
      });
    });
    if (teamId) {
      Object.entries(localAdjustments)
        .filter(([k]) => k.startsWith(`${teamId}_`))
        .flatMap(([key, items]) =>
          items.map((r) => ({
            ...r,
            yearMonth: key.split("_")[1] || "-",
          }))
        )
        .forEach((r) => {
          list.push({
            id: `local-${r.id}`,
            payment_type: r.type,
            year_month: r.yearMonth,
            amount: r.amount,
            comment: r.comment,
            created_at: r.created_at,
          });
        });
    }
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list;
  }, [teamId, localAdjustments, paymentLogs]);

  const [paymentTypeFilter, setPaymentTypeFilter] = useState<string[]>(["gift", "purchase", "contract", "cancel"]);

  const filteredPaymentRecords = useMemo(() => {
    if (paymentTypeFilter.length === 0) return [];
    return paymentRecordsList.filter((r) => {
      const type = r.payment_type === "renewal" ? "contract" : r.payment_type;
      return paymentTypeFilter.includes(type);
    });
  }, [paymentRecordsList, paymentTypeFilter]);

  const togglePaymentType = (value: string) => {
    setPaymentTypeFilter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  /** 从签约/续约记录中获取签约日（日），用于解约的合约日期计算：解约 N 月 = N月签约日 */
  const getContractSigningDay = useCallback((cancelYearMonth: string) => {
    const contract = paymentRecordsList
      .filter(
        (r) =>
          (r.payment_type === "contract" || r.payment_type === "renewal") &&
          r.year_month !== "-" &&
          r.year_month <= cancelYearMonth
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    if (!contract) return null;
    const d = new Date(contract.created_at);
    return Number.isNaN(d.getTime()) ? null : d.getDate();
  }, [paymentRecordsList]);

  /** 将缴费记录转换为 TableCanvasView 所需的 TableRow 格式 */
  const paymentTableRows: TableRow[] = useMemo(() => {
    return filteredPaymentRecords.map((r, index) => {
      const signingDay = r.payment_type === "cancel" ? getContractSigningDay(r.year_month) : undefined;
      return {
        id: r.id,
        table_id: "team-quota-payment-logs",
        row_id: index,
        cells: {
          type: PAYMENT_TYPE_LABELS[r.payment_type] ?? r.payment_type,
          year_month: formatPaymentDateForDisplay(r.payment_type, r.year_month, r.created_at, signingDay),
          amount: r.amount.toLocaleString(),
          comment: formatPaymentCommentForDisplay(r.payment_type, r.comment, r.year_month, signingDay),
          created_at: new Date(r.created_at).toLocaleString("zh-CN"),
        },
        created_at: r.created_at,
        updated_at: r.created_at,
      };
    });
  }, [filteredPaymentRecords, getContractSigningDay]);

  useEffect(() => {
    if (!open || paymentTableRows.length === 0) {
      setTableReady(false);
      return;
    }
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setTableReady(true));
    });
    return () => cancelAnimationFrame(t);
  }, [open, paymentTableRows.length]);

  const monthlyUsage = useMemo(() => {
    if (!packageOverview) return [];
    return [...packageOverview.months]
      .sort((a, b) => b.year_month.localeCompare(a.year_month))
      .map((m) => ({
        year_month: m.year_month,
        tokens_used: m.tokens_used,
        base_token_limit: m.base_token_limit,
        rollover_from_prev_tokens: m.rollover_from_prev_tokens ?? 0,
      }));
  }, [packageOverview]);

  const currentMonthForCalendar = usageSelectedMonth
    ? new Date(parseInt(usageSelectedMonth.slice(0, 4)), parseInt(usageSelectedMonth.slice(5, 7)) - 1, 1)
    : new Date();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] min-h-[480px] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            历史记录
          </DialogTitle>
          <DialogDescription className="text-sm">
            {teamName} - 缴费记录与 Token 用量
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="payment" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 max-w-[280px]">
            <TabsTrigger value="payment">缴费记录</TabsTrigger>
            <TabsTrigger value="usage">用量</TabsTrigger>
          </TabsList>
          <TabsContent value="payment" forceMount className="flex-1 min-h-[400px] mt-4 flex flex-col overflow-hidden data-[state=inactive]:hidden">
            <div className="shrink-0 flex items-center gap-2 mb-3">
              <span className="text-sm text-muted-foreground">类型筛选：</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 min-w-[140px] justify-between gap-2">
                    <span className="truncate">
                      {paymentTypeFilter.length === 0
                        ? "请选择类型"
                        : paymentTypeFilter.length === PAYMENT_TYPE_OPTIONS.length
                          ? "全部"
                          : PAYMENT_TYPE_OPTIONS.filter((o) => paymentTypeFilter.includes(o.value))
                              .map((o) => o.label)
                              .join("、")}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[140px]">
                  <DropdownMenuLabel>类型</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {PAYMENT_TYPE_OPTIONS.map((opt) => (
                    <DropdownMenuCheckboxItem
                      key={opt.value}
                      checked={paymentTypeFilter.includes(opt.value)}
                      onCheckedChange={() => togglePaymentType(opt.value)}
                    >
                      {opt.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="h-[320px] w-full overflow-hidden rounded-lg border bg-muted/20 flex flex-col shrink-0">
              {paymentTableRows.length > 0 && tableReady ? (
                <TableCanvasView
                  key={`payment-${paymentTableRows.length}-${paymentTableRows[0]?.id ?? ""}`}
                  table={paymentTable}
                  rows={paymentTableRows}
                  loading={false}
                  onCellChange={() => {}}
                  onAddRow={() => {}}
                  onDeleteColumn={() => {}}
                  onEditColumn={() => {}}
                  readOnly
                  hideIdColumn
                  persistColumnWidths={false}
                  initialColumnWidths={{
                    type: 90,
                    year_month: 110,
                    amount: 90,
                    comment: 140,
                    created_at: 160,
                  }}
                />
              ) : paymentTableRows.length > 0 ? (
                <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  加载中...
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  {paymentTypeFilter.length === 0 ? "请选择要查看的类型" : "暂无缴费记录"}
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="usage" className="flex-1 min-h-0 mt-4 flex flex-col overflow-hidden">
            <div className="flex flex-col flex-1 min-h-0 gap-4">
              <div className="space-y-2 shrink-0">
                <h4 className="text-sm font-medium">月度统计</h4>
                <div className="rounded-lg border bg-muted/20 p-3 text-sm max-h-40 overflow-y-auto">
                  {monthlyUsage.length > 0 ? (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left py-1">月份</th>
                          <th className="text-right py-1">已用</th>
                          <th className="text-right py-1">基础上限</th>
                          <th className="text-right py-1">结转</th>
                          <th className="text-right py-1">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyUsage.map((m) => (
                          <tr key={m.year_month} className="border-t">
                            <td className="py-1.5">{formatYearMonthToDisplay(m.year_month)}</td>
                            <td className="text-right font-medium tabular-nums">{m.tokens_used}</td>
                            <td className="text-right tabular-nums">{m.base_token_limit ?? "-"}</td>
                            <td className="text-right tabular-nums">{m.rollover_from_prev_tokens}</td>
                            <td className="text-right">
                              <button
                                type="button"
                                className="text-primary hover:underline text-xs"
                                onClick={() => {
                                  setUsageSelectedMonth(m.year_month);
                                  setUsageSelectedDate(undefined);
                                }}
                              >
                                查看详情
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-muted-foreground">暂无用量记录</p>
                  )}
                </div>
              </div>
              {usageSelectedMonth && (
                <div className="flex-1 min-h-0 flex flex-col border rounded-lg p-3">
                  <h4 className="text-sm font-medium mb-2">
                    {formatYearMonthToDisplay(usageSelectedMonth)} 每日详情
                  </h4>
                  <div className="flex-1 min-h-0 overflow-auto">
                    <Calendar
                      selected={usageSelectedDate}
                      onSelect={setUsageSelectedDate}
                      displayMonth={usageSelectedMonth}
                      className="border-0 p-0"
                    />
                  </div>
                  {usageSelectedDate && (
                    <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                      {usageSelectedDate.toLocaleDateString("zh-CN")} 的用量详情（需后端按日统计支持）
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
