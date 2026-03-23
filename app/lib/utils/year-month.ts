/**
 * 年月（YYYY-MM）格式工具函数
 */

/** YYYY-MM -> YYYY/MM/01 */
export function formatYearMonthToDate(ym: string): string {
  if (!ym || ym.length < 7) return ym;
  return `${ym.slice(0, 4)}/${ym.slice(5, 7)}/01`;
}

/** YYYY-MM -> 2026年3月4日（签约日）或 2026年3月1日（默认） */
export function formatYearMonthToDisplay(ym: string, signingDay?: number | null): string {
  if (!ym || ym.length < 7) return ym;
  const m = parseInt(ym.slice(5, 7), 10);
  const day = signingDay != null && signingDay >= 1 && signingDay <= 31 ? signingDay : 1;
  return `${ym.slice(0, 4)}年${m}月${day}日`;
}

/** YYYY-MM 的下一个月 YYYY-MM */
export function nextYearMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}
