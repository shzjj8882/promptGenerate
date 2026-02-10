"use client";

import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// 日期格式选项
export const DATE_FORMATS = [
  { value: "YYYY/MM/DD", label: "2026/01/30", format: (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
  }},
  { value: "YYYY/MM/DD HH:mm", label: "2026/01/30 14:00", format: (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  }},
  { value: "YYYY/MM/DD HH:mm (GMT+8)", label: "2026/01/30 14:00 (GMT+8)", format: (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}/${month}/${day} ${hours}:${minutes} (GMT+8)`;
  }},
  { value: "YYYY-MM-DD", label: "2026-01-30", format: (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }},
  { value: "YYYY-MM-DD HH:mm", label: "2026-01-30 14:00", format: (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }},
  { value: "YYYY-MM-DD HH:mm (GMT+8)", label: "2026-01-30 14:00 (GMT+8)", format: (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes} (GMT+8)`;
  }},
  { value: "MM-DD", label: "01-30", format: (date: Date) => {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${month}-${day}`;
  }},
  { value: "MM/DD/YYYY", label: "01/30/2026", format: (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${month}/${day}/${year}`;
  }},
  { value: "DD/MM/YYYY", label: "30/01/2026", format: (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${day}/${month}/${year}`;
  }},
] as const;

export interface DatePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  format?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  format = "YYYY/MM/DD",
  placeholder = "选择日期",
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
    value ? (() => {
      try {
        const date = new Date(value);
        return isNaN(date.getTime()) ? undefined : date;
      } catch {
        return undefined;
      }
    })() : undefined
  );
  const [timeValue, setTimeValue] = React.useState<string>("");

  const formatOption = DATE_FORMATS.find(f => f.value === format) || DATE_FORMATS[0];

  React.useEffect(() => {
    if (value) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          setSelectedDate(date);
          if (format.includes("HH:mm")) {
            const hours = String(date.getHours()).padStart(2, "0");
            const minutes = String(date.getMinutes()).padStart(2, "0");
            setTimeValue(`${hours}:${minutes}`);
          }
        }
      } catch (e) {
        // 解析失败，保持当前状态
      }
    } else {
      setSelectedDate(undefined);
      setTimeValue("");
    }
  }, [value, format]);

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    if (date && onChange) {
      let finalDate = new Date(date);
      if (format.includes("HH:mm") && timeValue) {
        const [hours, minutes] = timeValue.split(":").map(Number);
        if (!isNaN(hours) && !isNaN(minutes)) {
          finalDate.setHours(hours, minutes);
        }
      }
      onChange(formatOption.format(finalDate));
      // 如果不需要时间选择，选择日期后自动关闭
      if (!format.includes("HH:mm")) {
        setOpen(false);
      }
    } else if (!date && onChange) {
      onChange("");
    }
  };

  const handleTimeChange = (time: string) => {
    setTimeValue(time);
    if (selectedDate && onChange) {
      const [hours, minutes] = time.split(":").map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) {
        const newDate = new Date(selectedDate);
        newDate.setHours(hours, minutes);
        onChange(formatOption.format(newDate));
      }
    }
  };

  // 显示值：如果有 value，直接显示 value（已经是格式化后的），否则格式化 selectedDate
  const displayValue = value || (selectedDate ? formatOption.format(selectedDate) : "");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !displayValue && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayValue || <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="space-y-4 p-4">
          <Calendar
            selected={selectedDate}
            onSelect={handleDateSelect}
            disabled={disabled}
          />
          {format.includes("HH:mm") && (
            <div className="border-t pt-4">
              <Input
                type="time"
                value={timeValue}
                onChange={(e) => handleTimeChange(e.target.value)}
                className="w-full"
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
