import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DashboardNav } from "@/components/shared/dashboard-nav";

const mockUsePathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

const stores = vi.hoisted(() => ({ user: null as any, sidebarCollapsed: false }));
vi.mock("@/store/user-store", () => ({
  userStore: { get user() { return stores.user; }, set user(v) { stores.user = v; } },
}));
vi.mock("@/store/ui-store", () => ({
  uiStore: { get sidebarCollapsed() { return stores.sidebarCollapsed; }, set sidebarCollapsed(v) { stores.sidebarCollapsed = v; } },
}));

describe("DashboardNav", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/dashboard/tenants");
    stores.user = null;
    stores.sidebarCollapsed = false;
  });

  it("渲染主导航", () => {
    stores.user = { menu_permission_codes: ["menu:tenant:list"] };
    const { container } = render(<DashboardNav />);
    const nav = within(container).getByRole("navigation", { name: "主导航" });
    expect(nav).toBeInTheDocument();
  });

  it("有菜单权限时渲染对应链接", () => {
    stores.user = { menu_permission_codes: ["menu:tenant:list"] };
    const { container } = render(<DashboardNav />);
    const link = within(container).getByRole("link", { name: /租户管理/ });
    expect(link).toHaveAttribute("href", "/dashboard/tenants");
  });

  it("超级管理员显示团队管理链接", () => {
    stores.user = { is_superuser: true };
    const { container } = render(<DashboardNav />);
    expect(within(container).getByRole("link", { name: /团队管理/ })).toBeInTheDocument();
  });

  it("无用户时不渲染菜单项（仅 nav）", () => {
    stores.user = null;
    const { container } = render(<DashboardNav />);
    const nav = within(container).getByRole("navigation", { name: "主导航" });
    expect(nav).toBeInTheDocument();
    expect(within(container).queryByRole("link", { name: /租户管理/ })).not.toBeInTheDocument();
  });
});
