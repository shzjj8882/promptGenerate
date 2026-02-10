"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface CalendarProps {
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  className?: string;
  disabled?: boolean;
}

export function Calendar({
  selected,
  onSelect,
  className,
  disabled,
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState(
    selected ? new Date(selected.getFullYear(), selected.getMonth(), 1) : new Date()
  );

  const today = new Date();
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // 获取月份的第一天是星期几（0 = 周日）
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  // 获取月份的天数
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = [];

  // 填充第一周的空格
  for (let i = 0; i < firstDayOfMonth; i++) {
    week.push(null);
  }

  // 填充日期
  for (let day = 1; day <= daysInMonth; day++) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  // 填充最后一周的空格
  if (week.length > 0) {
    while (week.length < 7) {
      week.push(null);
    }
    weeks.push(week);
  }

  const isSelected = (day: number | null) => {
    if (!selected || day === null) return false;
    return (
      selected.getDate() === day &&
      selected.getMonth() === month &&
      selected.getFullYear() === year
    );
  };

  const isToday = (day: number | null) => {
    if (day === null) return false;
    return (
      today.getDate() === day &&
      today.getMonth() === month &&
      today.getFullYear() === year
    );
  };

  const handleDayClick = (day: number) => {
    if (disabled) return;
    const date = new Date(year, month, day);
    onSelect?.(date);
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const monthNames = [
    "一月", "二月", "三月", "四月", "五月", "六月",
    "七月", "八月", "九月", "十月", "十一月", "十二月"
  ];

  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

  return (
    <div className={cn("p-3", className)}>
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={goToPreviousMonth}
          disabled={disabled}
          className="h-7 w-7 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="font-medium">
          {year}年 {monthNames[month]}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={goToNextMonth}
          disabled={disabled}
          className="h-7 w-7 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) => (
          <div
            key={day}
            className="text-center text-sm font-medium text-muted-foreground p-1"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.map((week, weekIndex) =>
          week.map((day, dayIndex) => (
            <button
              key={`${weekIndex}-${dayIndex}`}
              onClick={() => day !== null && handleDayClick(day)}
              disabled={disabled || day === null}
              className={cn(
                "h-9 w-9 text-sm rounded-md hover:bg-accent hover:text-accent-foreground transition-colors",
                day === null && "cursor-default",
                day !== null && isSelected(day) && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                day !== null && isToday(day) && !isSelected(day) && "bg-accent font-semibold",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {day}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
