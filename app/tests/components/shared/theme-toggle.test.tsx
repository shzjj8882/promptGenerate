import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { ThemeToggle } from "@/components/shared/theme-toggle";

const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      value: matchMediaMock,
      writable: true,
    });
  });

  const wrap = (node: React.ReactNode) => (
    <ThemeProvider>{node}</ThemeProvider>
  );

  it("渲染切换主题按钮", () => {
    const { container } = render(wrap(<ThemeToggle />));
    const btn = container.querySelector('[data-slot="dropdown-menu-trigger"]') ?? container.querySelector('button');
    expect(btn).toBeInTheDocument();
  });

  it("渲染下拉触发按钮（含 sr-only 切换主题）", () => {
    const { container } = render(wrap(<ThemeToggle />));
    const srOnly = container.querySelector('.sr-only');
    expect(srOnly?.textContent).toMatch(/切换主题/);
  });
});
