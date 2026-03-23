"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RotateCcw } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { HistoryState, CompletedHistoryEntry } from "../table-editor-types";
import type { HistoryStepType } from "../table-editor-types";

export interface TableEditorHistorySidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: HistoryState[];
  historyIndex: number;
  completedHistory: CompletedHistoryEntry[];
  tab: "session" | "completed";
  onTabChange: (tab: "session" | "completed") => void;
  onRollbackToHistoryIndex: (index: number) => void;
  onRollbackToCompleted: (entry: CompletedHistoryEntry) => void;
}

export function TableEditorHistorySidebar({
  open,
  onOpenChange,
  history,
  historyIndex,
  completedHistory,
  tab,
  onTabChange,
  onRollbackToHistoryIndex,
  onRollbackToCompleted,
}: TableEditorHistorySidebarProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 overflow-hidden">
        <SheetHeader className="shrink-0 pb-4">
          <SheetTitle>历史记录</SheetTitle>
        </SheetHeader>
        <div className="flex shrink-0 border-b">
          <button
            type="button"
            onClick={() => onTabChange("session")}
            className={cn(
              "flex-1 py-2.5 text-sm font-medium transition-colors",
              tab === "session"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            本次记录
          </button>
          <button
            type="button"
            onClick={() => onTabChange("completed")}
            className={cn(
              "flex-1 py-2.5 text-sm font-medium transition-colors",
              tab === "completed"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            已完成操作
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto py-4">
          {tab === "session" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">保存前的操作步骤，可回滚到任一步</p>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">暂无记录</p>
              ) : (
                <ul className="space-y-3">
                  {history.map((state, index) => {
                    const stepType = state.stepType ?? "initial";
                    const statusLabel =
                      stepType === "initial"
                        ? "初始"
                        : stepType === "update"
                          ? "更新"
                          : stepType === "add"
                            ? "新增"
                            : stepType === "delete"
                              ? "删除"
                              : stepType === "import"
                                ? "导入"
                                : "调整";
                    const isCurrent = historyIndex === index;
                    const neutralStyle = "border-l-muted-foreground/30 bg-muted/30 dark:bg-muted/20";
                    const typeCardColors = {
                      initial: "border-l-muted-foreground/30 bg-muted/30 dark:bg-muted/20",
                      update: "border-l-blue-500 bg-blue-500/10 dark:bg-blue-500/20",
                      add: "border-l-green-600 bg-green-500/10 dark:bg-green-500/20",
                      delete: "border-l-destructive bg-destructive/10 dark:bg-destructive/20",
                      import: "border-l-violet-500 bg-violet-500/10 dark:bg-violet-500/20",
                      reorder: "border-l-amber-500 bg-amber-500/10 dark:bg-amber-500/20",
                    }[stepType];
                    const cardColors = isCurrent ? typeCardColors : neutralStyle;
                    const currentInitialBorder = isCurrent && stepType === "initial" ? "!border-l-neutral-900 dark:!border-l-neutral-100" : "";
                    const neutralBadgeClass =
                      "bg-muted text-muted-foreground border-muted-foreground/30 hover:bg-muted hover:text-muted-foreground";
                    const typeBadgeClass = {
                      initial: neutralBadgeClass,
                      update: "bg-blue-500/90 text-white border-transparent dark:bg-blue-600 dark:text-white hover:bg-blue-500/90 hover:text-white",
                      add: "bg-green-600/90 text-white border-transparent dark:bg-green-600 dark:text-white hover:bg-green-600/90 hover:text-white",
                      delete:
                        "bg-destructive text-white border-transparent hover:bg-destructive/90 hover:text-white dark:bg-destructive dark:text-white dark:hover:bg-destructive/90",
                      import: "bg-violet-500/90 text-white border-transparent dark:bg-violet-600 dark:text-white hover:bg-violet-500/90 hover:text-white",
                      reorder: "bg-amber-500/90 text-white border-transparent dark:bg-amber-500 dark:text-white hover:bg-amber-500/90 hover:text-white",
                    }[stepType];
                    const badgeClass = isCurrent ? typeBadgeClass : neutralBadgeClass;
                    return (
                      <li
                        key={index}
                        className={cn(
                          "group flex min-h-[80px] flex-col rounded-lg border border-l-4 p-0 text-sm",
                          cardColors,
                          currentInitialBorder,
                          isCurrent && "ring-1 ring-primary/25"
                        )}
                      >
                        <div className="flex flex-none items-center gap-2 px-3 py-2 border-b border-border/50">
                          <Badge className={cn("shrink-0 border text-xs", badgeClass)}>{statusLabel}</Badge>
                          <div className="min-w-0 flex-1" />
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => onRollbackToHistoryIndex(index)}
                              disabled={isCurrent}
                              title="回滚"
                              className={cn(
                                "h-7 w-7 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity",
                                "bg-neutral-900 text-white hover:bg-neutral-800 hover:text-white",
                                "dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 dark:hover:text-neutral-900"
                              )}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col gap-1 px-3 py-2.5">
                          <div
                            className={cn("text-xs font-medium", isCurrent ? "text-foreground" : "text-muted-foreground")}
                            title={state.stepTitle ?? state.stepLabel}
                          >
                            {state.stepTitle ?? state.stepLabel ?? (index === 0 ? "初始状态" : `步骤 ${index}`)}
                          </div>
                          {state.stepDescription && (
                            <div className="text-xs text-muted-foreground line-clamp-2 break-words" title={state.stepDescription}>
                              {state.stepDescription}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {completedHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">暂无已完成记录</p>
              ) : (
                (() => {
                  const byDay = completedHistory.reduce<Record<string, CompletedHistoryEntry[]>>((acc, entry) => {
                    if (!acc[entry.dateKey]) acc[entry.dateKey] = [];
                    acc[entry.dateKey].push(entry);
                    return acc;
                  }, {});
                  const days = Object.keys(byDay).sort((a, b) => b.localeCompare(a));
                  return (
                    <ul className="space-y-4">
                      {days.map((dateKey) => (
                        <li key={dateKey}>
                          <div className="text-sm font-semibold text-foreground mb-2">{dateKey}</div>
                          <ul className="space-y-2">
                            {byDay[dateKey].map((entry) => (
                              <li
                                key={entry.id}
                                className="group flex items-center justify-between gap-2 rounded-lg border bg-background p-3 text-sm"
                              >
                                <span className="min-w-0 flex-1 text-muted-foreground">
                                  {entry.label}
                                  <span className="ml-1 text-xs">
                                    {new Date(entry.timestamp).toLocaleTimeString("zh-CN", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      second: "2-digit",
                                    })}
                                  </span>
                                </span>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  onClick={() => onRollbackToCompleted(entry)}
                                  title="回滚到此版本"
                                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  );
                })()
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
