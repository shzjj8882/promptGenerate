import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatDateTime } from "@/lib/utils/format";

describe("formatDateTime", () => {
  const fixedDate = new Date("2024-06-15T14:30:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Date 对象格式化为日期时间（中文）", () => {
    const str = formatDateTime(new Date("2024-01-02T08:05:00.000Z"));
    expect(str).toMatch(/\d{4}\/\d{1,2}\/\d{1,2}/);
    expect(str).toMatch(/\d{1,2}:\d{2}/);
  });

  it("字符串日期可解析并格式化", () => {
    const str = formatDateTime("2024-12-25T10:00:00.000Z");
    expect(str).toMatch(/2024/);
    expect(str).toMatch(/12/);
    expect(str).toMatch(/25/);
  });

  it("dateOnly: true 只输出日期（无时分）", () => {
    const str = formatDateTime(new Date("2024-03-10T18:00:00.000Z"), {
      dateOnly: true,
    });
    expect(str).toMatch(/2024/);
    expect(str).toMatch(/\d{1,2}/);
    // 不包含时分格式（如 18:00）
    expect(str).not.toMatch(/\d{1,2}:\d{2}/);
  });
});
