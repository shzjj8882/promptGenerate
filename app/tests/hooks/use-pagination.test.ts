import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePagination } from "@/hooks/use-pagination";

describe("usePagination", () => {
  it("使用默认初始值", () => {
    const { result } = renderHook(() => usePagination());
    expect(result.current.currentPage).toBe(1);
    expect(result.current.totalCount).toBe(0);
    expect(result.current.totalPages).toBe(0);
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.hasPreviousPage).toBe(false);
    expect(result.current.skip).toBe(0);
  });

  it("支持 initialPage 和 initialTotal", () => {
    const { result } = renderHook(() =>
      usePagination({ initialPage: 2, initialTotal: 25 })
    );
    expect(result.current.currentPage).toBe(2);
    expect(result.current.totalCount).toBe(25);
    expect(result.current.totalPages).toBe(3); // 25/10
    expect(result.current.skip).toBe(10);
  });

  it("setCurrentPage 更新当前页", () => {
    const { result } = renderHook(() =>
      usePagination({ initialTotal: 30 })
    );
    expect(result.current.currentPage).toBe(1);

    act(() => {
      result.current.setCurrentPage(2);
    });
    expect(result.current.currentPage).toBe(2);
    expect(result.current.skip).toBe(10);
  });

  it("setTotalCount 更新总条数并影响 totalPages", () => {
    const { result } = renderHook(() =>
      usePagination({ initialPage: 1, initialTotal: 0 })
    );
    expect(result.current.totalPages).toBe(0);

    act(() => {
      result.current.setTotalCount(35);
    });
    expect(result.current.totalCount).toBe(35);
    expect(result.current.totalPages).toBe(4);
  });

  it("goToNextPage 在未到最后一页时翻页", () => {
    const { result } = renderHook(() =>
      usePagination({ initialPage: 1, initialTotal: 25 })
    );
    expect(result.current.currentPage).toBe(1);
    expect(result.current.hasNextPage).toBe(true);

    act(() => {
      result.current.goToNextPage();
    });
    expect(result.current.currentPage).toBe(2);

    act(() => {
      result.current.goToNextPage();
    });
    expect(result.current.currentPage).toBe(3);

    act(() => {
      result.current.goToNextPage();
    });
    expect(result.current.currentPage).toBe(3); // 已在最后一页，不再增加
  });

  it("goToPreviousPage 在第一页时不改变", () => {
    const { result } = renderHook(() =>
      usePagination({ initialPage: 1, initialTotal: 25 })
    );
    act(() => {
      result.current.goToPreviousPage();
    });
    expect(result.current.currentPage).toBe(1);
  });

  it("goToFirstPage 和 goToLastPage", () => {
    const { result } = renderHook(() =>
      usePagination({ initialPage: 3, initialTotal: 25 })
    );
    expect(result.current.currentPage).toBe(3);

    act(() => {
      result.current.goToFirstPage();
    });
    expect(result.current.currentPage).toBe(1);

    act(() => {
      result.current.goToLastPage();
    });
    expect(result.current.currentPage).toBe(3);
  });
});
