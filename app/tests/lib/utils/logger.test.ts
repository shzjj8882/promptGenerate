import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@/lib/utils/logger";

describe("logger", () => {
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "group").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    vi.spyOn(console, "table").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warn 输出到 console.warn", () => {
    logger.warn("msg");
    expect(console.warn).toHaveBeenCalledWith("[WARN] msg");
  });

  it("error 输出到 console.error", () => {
    logger.error("msg", new Error("e"));
    expect(console.error).toHaveBeenCalledWith("[ERROR] msg", expect.any(Error));
  });

  it("debug 不抛错", () => {
    expect(() => logger.debug("msg", "arg")).not.toThrow();
  });

  it("info 不抛错", () => {
    expect(() => logger.info("msg")).not.toThrow();
  });

  it("group / groupEnd 不抛错", () => {
    expect(() => logger.group("label")).not.toThrow();
    expect(() => logger.groupEnd()).not.toThrow();
  });

  it("table 不抛错", () => {
    expect(() => logger.table([{ a: 1 }])).not.toThrow();
  });
});
