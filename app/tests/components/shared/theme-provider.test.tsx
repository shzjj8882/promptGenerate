import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@/components/shared/theme-provider";

describe("ThemeProvider", () => {
  const getItem = vi.fn();
  const setItem = vi.fn();

  beforeEach(() => {
    getItem.mockReturnValue(null);
    setItem.mockClear();
    Object.defineProperty(window, "localStorage", {
      value: { getItem, setItem },
      writable: true,
    });
    const matchMediaImpl = (q: string) => ({
      matches: false,
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    Object.defineProperty(window, "matchMedia", {
      value: (query: string) => matchMediaImpl(query),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("渲染 children", () => {
    render(
      <ThemeProvider>
        <span>内容</span>
      </ThemeProvider>
    );
    expect(screen.getByText("内容")).toBeInTheDocument();
  });

  it("提供 useTheme 上下文", () => {
    function Consumer() {
      const { theme, setTheme } = useTheme();
      return (
        <div>
          <span data-testid="theme">{theme}</span>
          <button type="button" onClick={() => setTheme("dark")}>
            切换
          </button>
        </div>
      );
    }
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId("theme")).toHaveTextContent(/system|light|dark/);
    expect(screen.getByRole("button", { name: "切换" })).toBeInTheDocument();
  });
});

// useTheme 在 Provider 外调用会抛错，由 React 渲染阶段报错，此处仅覆盖 Provider 内用法
