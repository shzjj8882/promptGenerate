import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSearch } from "@/hooks/use-search";

describe("useSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("默认 initialValue 为空字符串", () => {
    const { result } = renderHook(() => useSearch());
    expect(result.current.searchQuery).toBe("");
    expect(result.current.debouncedSearchQuery).toBe("");
  });

  it("支持 initialValue", () => {
    const { result } = renderHook(() =>
      useSearch({ initialValue: "hello" })
    );
    expect(result.current.searchQuery).toBe("hello");
    expect(result.current.debouncedSearchQuery).toBe("hello");
  });

  it("setSearchQuery 更新 searchQuery，防抖后更新 debouncedSearchQuery", () => {
    const { result } = renderHook(() =>
      useSearch({ debounceDelay: 300 })
    );
    act(() => {
      result.current.setSearchQuery("ab");
    });
    expect(result.current.searchQuery).toBe("ab");
    expect(result.current.debouncedSearchQuery).toBe("");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.debouncedSearchQuery).toBe("ab");
  });

  it("clearSearch 清空 searchQuery", () => {
    const { result } = renderHook(() =>
      useSearch({ initialValue: "x" })
    );
    act(() => {
      result.current.clearSearch();
    });
    expect(result.current.searchQuery).toBe("");
  });
});
