"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  getMyTeamUsageLogs,
  type TeamUsageLogItem,
} from "@/lib/api/teams";
import { ChevronLeft, ChevronRight, History } from "@/components/icons";

const PAGE_SIZE = 20;

interface UsageLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 初始筛选：月份 YYYY-MM */
  defaultYearMonth?: string;
  /** 初始筛选：起始日期 */
  defaultStartDate?: string;
  /** 初始筛选：结束日期 */
  defaultEndDate?: string;
  /** 初始筛选：业务名称 */
  defaultBusinessName?: string;
}

function formatDateTime(iso: string) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function UsageLogsDialog({
  open,
  onOpenChange,
  defaultYearMonth,
  defaultStartDate,
  defaultEndDate,
  defaultBusinessName,
}: UsageLogsDialogProps) {
  const [yearMonth, setYearMonth] = useState(defaultYearMonth ?? "");
  const [startDate, setStartDate] = useState(defaultStartDate ?? "");
  const [endDate, setEndDate] = useState(defaultEndDate ?? "");
  const [businessName, setBusinessName] = useState(defaultBusinessName ?? "");
  const [skip, setSkip] = useState(0);
  const [items, setItems] = useState<TeamUsageLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const params: Parameters<typeof getMyTeamUsageLogs>[0] = {
        skip,
        limit: PAGE_SIZE,
      };
      if (yearMonth) params.year_month = yearMonth;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (businessName) params.business_name = businessName;
      const res = await getMyTeamUsageLogs(params);
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [open, skip, yearMonth, startDate, endDate, businessName]);

  useEffect(() => {
    if (open) {
      setSkip(0);
    }
  }, [open]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            用量日志
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          <div className="flex flex-wrap gap-4 items-end shrink-0">
            <div className="space-y-1">
              <Label className="text-xs">月份</Label>
              <DatePicker
                value={yearMonth ? `${yearMonth}-01` : ""}
                onChange={(v) => setYearMonth(v ? v.slice(0, 7) : "")}
                format="YYYY-MM-DD"
                placeholder="选择月份"
                className="w-36"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">起始日期</Label>
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                format="YYYY-MM-DD"
                placeholder="选择起始日期"
                className="w-36"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">结束日期</Label>
              <DatePicker
                value={endDate}
                onChange={setEndDate}
                format="YYYY-MM-DD"
                placeholder="选择结束日期"
                className="w-36"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">业务名称</Label>
              <Input
                placeholder="筛选业务"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-32"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSkip(0);
                fetchLogs();
              }}
            >
              查询
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto border rounded-lg">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                加载中...
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                暂无用量日志
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">日期</th>
                    <th className="text-left p-2 font-medium">业务</th>
                    <th className="text-right p-2 font-medium">Token 用量</th>
                    <th className="text-right p-2 font-medium">调用次数</th>
                    <th className="text-left p-2 font-medium">记录时间</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((log) => (
                    <tr key={log.id} className="border-t">
                      <td className="p-2">{log.usage_date}</td>
                      <td className="p-2">{log.business_name ?? "-"}</td>
                      <td className="p-2 text-right font-mono">
                        {log.tokens_used.toLocaleString()}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {log.calls_count.toLocaleString()}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {formatDateTime(log.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {total > 0 && (
            <div className="flex items-center justify-between shrink-0">
              <span className="text-sm text-muted-foreground">
                共 {total} 条
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={skip <= 0 || loading}
                  onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={skip + PAGE_SIZE >= total || loading}
                  onClick={() => setSkip((s) => s + PAGE_SIZE)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
