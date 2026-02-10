import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PermissionButton } from "@/components/shared/permission-button";

const mockHasPermission = vi.hoisted(() => vi.fn());
vi.mock("@/lib/permissions", () => ({
  useHasMenuButtonPermission: (code: string) => mockHasPermission(code),
}));

describe("PermissionButton", () => {
  beforeEach(() => {
    mockHasPermission.mockReturnValue(true);
  });

  it("有权限时渲染按钮", () => {
    mockHasPermission.mockReturnValue(true);
    render(
      <PermissionButton permission="menu:tenant:create">
        新建
      </PermissionButton>
    );
    expect(screen.getByRole("button", { name: "新建" })).toBeInTheDocument();
  });

});
