"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo } from "react";

interface SortIconProps {
  sorted: false | "asc" | "desc";
  className?: string;
}

/**
 * 排序图标组件
 * 用于表格列头的排序状态显示
 */
export function SortIcon({ sorted, className = "ml-2 h-4 w-4" }: SortIconProps) {
  const icon = useMemo(() => {
    if (sorted === "asc") {
      return <ArrowUp className={`${className} opacity-70`} />;
    }
    if (sorted === "desc") {
      return <ArrowDown className={`${className} opacity-70`} />;
    }
    return <ArrowUpDown className={`${className} opacity-40`} />;
  }, [sorted, className]);

  return icon;
}
