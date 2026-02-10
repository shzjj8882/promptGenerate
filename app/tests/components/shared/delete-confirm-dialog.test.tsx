import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog";

describe("DeleteConfirmDialog", () => {
  it("渲染标题与描述", () => {
    render(
      <DeleteConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="删除确认"
        description="确定要删除此项吗？"
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { name: "删除确认" })).toBeInTheDocument();
    expect(screen.getByText("确定要删除此项吗？")).toBeInTheDocument();
  });

  it("显示不可恢复提示", () => {
    render(
      <DeleteConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="删除"
        description="描述"
        onConfirm={vi.fn()}
      />
    );
    const nodes = screen.getAllByText("此操作不可恢复。");
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes[0]).toBeInTheDocument();
  });

  it("loading 时确认按钮显示删除中", () => {
    render(
      <DeleteConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="删除"
        description="描述"
        onConfirm={vi.fn()}
        loading
      />
    );
    expect(screen.getByRole("button", { name: "删除中..." })).toBeInTheDocument();
  });

  it("requireConfirmName 且名称不匹配时确认按钮禁用", () => {
    render(
      <DeleteConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="删除"
        description="描述"
        itemName="我的资源"
        onConfirm={vi.fn()}
        requireConfirmName
        confirmName=""
      />
    );
    const confirmBtn = screen.getByRole("button", { name: "确认删除" });
    expect(confirmBtn).toBeDisabled();
  });

  it("error 时显示错误信息", () => {
    render(
      <DeleteConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="删除"
        description="描述"
        onConfirm={vi.fn()}
        error="名称错误"
      />
    );
    expect(screen.getByText("名称错误")).toBeInTheDocument();
  });
});
