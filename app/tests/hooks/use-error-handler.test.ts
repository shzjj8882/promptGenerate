import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { ApiError } from "@/lib/api/config";
import * as errorUtils from "@/lib/utils/error";
import * as toastUtils from "@/lib/utils/toast";

vi.mock("@/lib/utils/error", () => ({
  getDisplayMessage: vi.fn((_e: unknown, fallback: string) => fallback),
}));
vi.mock("@/lib/utils/toast", () => ({
  showErrorToast: vi.fn(),
}));

describe("useErrorHandler", () => {
  const defaultMessage = "默认错误";

  beforeEach(() => {
    vi.mocked(errorUtils.getDisplayMessage).mockImplementation((_, fallback) => fallback);
    vi.mocked(toastUtils.showErrorToast).mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("调用 getDisplayMessage 并返回展示文案", () => {
    vi.mocked(errorUtils.getDisplayMessage).mockReturnValue("展示文案");
    const { result } = renderHook(() => useErrorHandler());
    let msg: string;
    act(() => {
      msg = result.current.handleError(new Error(), defaultMessage);
    });
    expect(errorUtils.getDisplayMessage).toHaveBeenCalledWith(expect.any(Error), defaultMessage);
    expect(msg!).toBe("展示文案");
  });

  it("默认 showToast 为 true 时调用 showErrorToast", () => {
    vi.mocked(errorUtils.getDisplayMessage).mockReturnValue("err");
    const { result } = renderHook(() => useErrorHandler());
    act(() => {
      result.current.handleError(new Error(), defaultMessage);
    });
    expect(toastUtils.showErrorToast).toHaveBeenCalledWith("err");
  });

  it("showToast: false 时不调用 showErrorToast", () => {
    vi.mocked(errorUtils.getDisplayMessage).mockReturnValue("err");
    const { result } = renderHook(() => useErrorHandler({ showToast: false }));
    act(() => {
      result.current.handleError(new Error(), defaultMessage);
    });
    expect(toastUtils.showErrorToast).not.toHaveBeenCalled();
  });

  it("传入 setError 时会被调用", () => {
    const setError = vi.fn();
    vi.mocked(errorUtils.getDisplayMessage).mockReturnValue("err");
    const { result } = renderHook(() => useErrorHandler({ setError }));
    act(() => {
      result.current.handleError(new Error(), defaultMessage);
    });
    expect(setError).toHaveBeenCalledWith("err");
  });

  it("customOptions.showToast 覆盖默认行为", () => {
    vi.mocked(errorUtils.getDisplayMessage).mockReturnValue("err");
    const { result } = renderHook(() => useErrorHandler({ showToast: false }));
    act(() => {
      result.current.handleError(new Error(), defaultMessage, { showToast: true });
    });
    expect(toastUtils.showErrorToast).toHaveBeenCalledWith("err");
  });

  it("ApiError 400 不记录 console.error", () => {
    vi.mocked(errorUtils.getDisplayMessage).mockReturnValue("业务错误");
    const { result } = renderHook(() => useErrorHandler({ logToConsole: true }));
    act(() => {
      result.current.handleError(new ApiError("密码错误", 400), defaultMessage);
    });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("非 ApiError 400 时根据 logToConsole 记录控制台", () => {
    vi.mocked(errorUtils.getDisplayMessage).mockReturnValue("err");
    const { result } = renderHook(() => useErrorHandler({ logToConsole: true }));
    act(() => {
      result.current.handleError(new Error("network"), defaultMessage);
    });
    expect(console.error).toHaveBeenCalledWith(defaultMessage, expect.any(Error));
  });

  it("logToConsole: false 时不记录控制台", () => {
    vi.mocked(errorUtils.getDisplayMessage).mockReturnValue("err");
    const { result } = renderHook(() => useErrorHandler({ logToConsole: false }));
    act(() => {
      result.current.handleError(new Error(), defaultMessage);
    });
    expect(console.error).not.toHaveBeenCalled();
  });
});
