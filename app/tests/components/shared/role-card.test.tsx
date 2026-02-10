import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoleCard } from "@/components/shared/role-card";
import type { Role } from "@/lib/api/rbac";

const mockRole: Role = {
  id: "r1",
  name: "管理员",
  code: "admin",
  is_active: true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  permissions: [
    { 
      id: "p1", 
      name: "权限1",
      code: "p1",
      resource: "resource1",
      action: "read",
      is_active: true,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
    { 
      id: "p2", 
      name: "权限2",
      code: "p2",
      resource: "resource2",
      action: "write",
      is_active: true,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
  ],
};

describe("RoleCard", () => {
  it("渲染角色名称与代码", () => {
    render(
      <RoleCard role={mockRole} onEdit={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByText("管理员")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("渲染权限列表", () => {
    render(
      <RoleCard role={mockRole} onEdit={vi.fn()} onDelete={vi.fn()} />
    );
    const p1 = screen.getAllByText("权限1");
    const p2 = screen.getAllByText("权限2");
    expect(p1.length).toBeGreaterThan(0);
    expect(p2.length).toBeGreaterThan(0);
  });

  it("有 description 时渲染描述", () => {
    render(
      <RoleCard
        role={{ ...mockRole, description: "角色说明" }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText("角色说明")).toBeInTheDocument();
  });

  it("无权限时显示暂无权限", () => {
    render(
      <RoleCard
        role={{ ...mockRole, permissions: [] }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText("暂无权限")).toBeInTheDocument();
  });

  it("有 onToggleActive 时渲染开关", () => {
    const onToggleActive = vi.fn();
    render(
      <RoleCard
        role={mockRole}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleActive={onToggleActive}
      />
    );
    const switchEl = screen.getByRole("switch");
    expect(switchEl).toBeInTheDocument();
    fireEvent.click(switchEl);
    expect(onToggleActive).toHaveBeenCalledWith(mockRole);
  });

  it("点击编辑调用 onEdit", () => {
    const onEdit = vi.fn();
    const { container } = render(<RoleCard role={mockRole} onEdit={onEdit} onDelete={vi.fn()} />);
    const editButton = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("编辑"));
    if (editButton) fireEvent.click(editButton);
    expect(onEdit).toHaveBeenCalledWith(mockRole);
  });
});
