/**
 * 表格行工具函数
 */

import type { TableRow } from "@/lib/api/multi-dimension-tables";

/**
 * 过滤掉已标记删除的行
 */
export function filterNonDeletedRows<T extends TableRow>(rows: T[]): T[] {
  return rows.filter((row) => !row._deleted);
}
