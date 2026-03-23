import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "@/components/shared/error-boundary";

const ThrowError = () => {
  throw new Error("测试错误");
};

describe("ErrorBoundary", () => {
  it("子组件正常时渲染子内容", () => {
    render(
      <ErrorBoundary>
        <div>正常内容</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("正常内容")).toBeInTheDocument();
  });

  it("子组件抛出错误时渲染默认错误 UI", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("加载出错")).toBeInTheDocument();
    expect(screen.getByText("测试错误")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it("传入 fallback 时使用自定义错误 UI", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>自定义错误</div>}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("自定义错误")).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it("点击重试时恢复渲染子组件", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const errorHandler = (e: ErrorEvent) => {
      if (e.message?.includes("concurrent rendering") || e.message === "错误") {
        e.preventDefault();
        e.stopPropagation();
        return true;
      }
      return false;
    };
    window.addEventListener("error", errorHandler);

    let shouldThrow = true;
    const ThrowThenSucceed = () => {
      if (shouldThrow) {
        shouldThrow = false;
        throw new Error("错误");
      }
      return <div>恢复后内容</div>;
    };

    render(
      <ErrorBoundary>
        <ThrowThenSucceed />
      </ErrorBoundary>
    );

    expect(screen.getByText("加载出错")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(screen.getByText("恢复后内容")).toBeInTheDocument();

    window.removeEventListener("error", errorHandler);
    consoleSpy.mockRestore();
  });

  it("onError 回调被调用", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.any(Object));

    consoleSpy.mockRestore();
  });
});
