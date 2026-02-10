import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  showErrorToast,
  showSuccessToast,
  showInfoToast,
  showWarningToast,
} from "@/lib/utils/toast";

const toastMock = {
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

vi.mock("sonner", () => ({
  toast: toastMock,
}));

describe("toast", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      writable: true,
    });
    vi.clearAllMocks();
  });

  describe("showErrorToast", () => {
    it("在 window 存在时调用 sonner toast.error", async () => {
      showErrorToast("错误信息");
      await vi.waitFor(() => {
        expect(toastMock.error).toHaveBeenCalledWith("错误信息", {
          duration: 3000,
        });
      });
    });
  });

  describe("showSuccessToast", () => {
    it("在 window 存在时调用 sonner toast.success", async () => {
      showSuccessToast("成功");
      await vi.waitFor(() => {
        expect(toastMock.success).toHaveBeenCalledWith("成功", {
          duration: 3000,
        });
      });
    });
  });

  describe("showInfoToast", () => {
    it("在 window 存在时调用 sonner toast.info", async () => {
      showInfoToast("提示");
      await vi.waitFor(() => {
        expect(toastMock.info).toHaveBeenCalledWith("提示", {
          duration: 3000,
        });
      });
    });
  });

  describe("showWarningToast", () => {
    it("在 window 存在时调用 sonner toast.warning", async () => {
      showWarningToast("警告");
      await vi.waitFor(() => {
        expect(toastMock.warning).toHaveBeenCalledWith("警告", {
          duration: 3000,
        });
      });
    });
  });

  describe("SSR：window 不存在时不抛错", () => {
    beforeEach(() => {
      // 模拟 SSR 环境
      Object.defineProperty(globalThis, "window", {
        value: undefined,
        writable: true,
      });
    });

    it("showErrorToast 不抛错", () => {
      expect(() => showErrorToast("err")).not.toThrow();
    });
    it("showSuccessToast 不抛错", () => {
      expect(() => showSuccessToast("ok")).not.toThrow();
    });
  });
});
