import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAsyncOperation } from "@/hooks/use-async-operation";

vi.mock("@/lib/utils/error", () => ({
  getDisplayMessage: vi.fn((_e: unknown, fallback: string) => fallback),
}));

const toastModule = { showErrorToast: vi.fn() };
vi.mock("@/lib/utils/toast", () => ({ showErrorToast: vi.fn() }));

describe("useAsyncOperation", () => {
  beforeEach(() => {
    vi.mocked(toastModule.showErrorToast).mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("初始状态 loading false、error null", () => {
    const { result } = renderHook(() => useAsyncOperation());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it("execute 成功时返回结果并调用 onSuccess", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useAsyncOperation({ onSuccess })
    );
    let resolved: number | undefined;
    await act(async () => {
      resolved = await result.current.execute(() => Promise.resolve(42));
    });
    expect(resolved).toBe(42);
    expect(onSuccess).toHaveBeenCalledWith(42);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it("execute 失败时设置 error 并调用 onError，setError 可清空 error", async () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useAsyncOperation({ onError })
    );
    await act(async () => {
      await result.current.execute(() => Promise.reject(new Error("fail")));
    });
    expect(result.current.error).toBe("操作失败，请稍后重试");
    expect(onError).toHaveBeenCalledWith("操作失败，请稍后重试");
    expect(result.current.loading).toBe(false);
    act(() => {
      result.current.setError(null);
    });
    expect(result.current.error).toBe(null);
  });

  it("showErrorToast 为 true 时失败会调用 showErrorToast", async () => {
    const { showErrorToast: showToast } = await import("@/lib/utils/toast");
    const { result } = renderHook(() =>
      useAsyncOperation({ showErrorToast: true })
    );
    await act(async () => {
      await result.current.execute(() => Promise.reject(new Error("fail")));
    });
    expect(showToast).toHaveBeenCalledWith("操作失败，请稍后重试");
  });

  it("preventDuplicate 为 true 时并发只执行第一次", async () => {
    const run = vi.fn().mockResolvedValue(1);
    const { result } = renderHook(() =>
      useAsyncOperation<void>({ preventDuplicate: true })
    );
    const promise1 = act(async () => result.current.execute(run));
    const promise2 = act(async () => result.current.execute(run));
    await promise1;
    await promise2;
    expect(run).toHaveBeenCalledTimes(1);
  });

});
