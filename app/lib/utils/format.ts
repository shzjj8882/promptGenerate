/**
 * 日期时间格式化（中文）
 */
export function formatDateTime(
  date: string | Date,
  options?: { dateOnly?: boolean }
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (options?.dateOnly) {
    return d.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
