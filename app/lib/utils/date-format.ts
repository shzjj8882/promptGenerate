/**
 * 日期格式转换工具
 * 将日期字符串从旧格式转换为新格式
 */

import { DATE_FORMATS } from "@/components/ui/date-picker";

/**
 * 将日期字符串从旧格式转换为新格式
 * @param dateValue 日期字符串
 * @param oldFormat 旧格式（如 YYYY/MM/DD、DD/MM/YYYY）
 * @param newFormat 新格式（DATE_FORMATS 中的 value）
 */
export function convertDateFormat(
  dateValue: string,
  oldFormat: string,
  newFormat: string
): string {
  if (!dateValue) return "";

  try {
    let date: Date | null = null;

    // 方法1: 直接使用 Date 构造函数（适用于 ISO 格式和常见格式）
    date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      if (year >= 1900 && year <= 2100) {
        const formatOption = DATE_FORMATS.find((f) => f.value === newFormat);
        if (formatOption) {
          return formatOption.format(date);
        }
      }
    }

    // 方法2: 手动解析常见格式
    const patterns = [
      /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/, // YYYY/MM/DD 或 YYYY-MM-DD
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // MM/DD/YYYY 或 DD/MM/YYYY
    ];

    for (const pattern of patterns) {
      const match = dateValue.match(pattern);
      if (match) {
        let year: number, month: number, day: number;

        if (pattern === patterns[0]) {
          year = parseInt(match[1], 10);
          month = parseInt(match[2], 10) - 1;
          day = parseInt(match[3], 10);
        } else {
          if (oldFormat === "DD/MM/YYYY") {
            day = parseInt(match[1], 10);
            month = parseInt(match[2], 10) - 1;
            year = parseInt(match[3], 10);
          } else {
            month = parseInt(match[1], 10) - 1;
            day = parseInt(match[2], 10);
            year = parseInt(match[3], 10);
          }
        }

        date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          const formatOption = DATE_FORMATS.find((f) => f.value === newFormat);
          if (formatOption) {
            return formatOption.format(date);
          }
        }
      }
    }

    return dateValue;
  } catch {
    return dateValue;
  }
}
