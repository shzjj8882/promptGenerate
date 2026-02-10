import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { UnauthorizedDialog } from "@/components/shared/unauthorized-dialog";

const mockRemoveAuthToken = vi.fn();
vi.mock("@/lib/api/config", () => ({
  removeAuthToken: () => mockRemoveAuthToken(),
}));

describe("UnauthorizedDialog", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    mockRemoveAuthToken.mockClear();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, href: "" },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
  });

  it("初始不显示对话框", () => {
    render(<UnauthorizedDialog />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("监听 unauthorized 事件后显示对话框", async () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    render(<UnauthorizedDialog />);
    expect(addEventListener).toHaveBeenCalledWith("unauthorized", expect.any(Function));
    const handler = addEventListener.mock.calls.find((c) => c[0] === "unauthorized")?.[1] as (e: CustomEvent) => void;
    handler(new CustomEvent("unauthorized", { detail: undefined }));
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
    expect(screen.getByText("登录已过期，请重新登录")).toBeInTheDocument();
  });

  it("事件带 detail 时显示自定义文案", async () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    render(<UnauthorizedDialog />);
    const handler = addEventListener.mock.calls.find((c) => c[0] === "unauthorized")?.[1] as (e: CustomEvent) => void;
    handler(new CustomEvent("unauthorized", { detail: "会话失效" }));
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
    expect(screen.getByText("会话失效")).toBeInTheDocument();
  });

  it("点击确认调用 removeAuthToken 并跳转登录", async () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    render(<UnauthorizedDialog />);
    const handler = addEventListener.mock.calls.find((c) => c[0] === "unauthorized")?.[1] as (e: CustomEvent) => void;
    handler(new CustomEvent("unauthorized"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /确认并返回登录/ })).toBeInTheDocument();
    });
    screen.getByRole("button", { name: /确认并返回登录/ }).click();
    expect(mockRemoveAuthToken).toHaveBeenCalled();
    expect(window.location.href).toBe("/login");
  });
});
