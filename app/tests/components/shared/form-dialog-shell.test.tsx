import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormDialogShell } from "@/components/shared/form-dialog-shell";

describe("FormDialogShell", () => {
  it("open 为 true 时渲染对话框标题和内容", () => {
    render(
      <FormDialogShell open title="测试标题" onOpenChange={() => {}}>
        <p>表单内容</p>
      </FormDialogShell>
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("测试标题")).toBeInTheDocument();
    expect(screen.getByText("表单内容")).toBeInTheDocument();
  });

  it("open 为 false 时对话框内容不可见（Radix 可能保留 DOM）", () => {
    render(
      <FormDialogShell open={false} title="测试" onOpenChange={() => {}}>
        <p>隐藏内容</p>
      </FormDialogShell>
    );
    // Radix Dialog 在 closed 时可能仍挂载，但内容不应可见
    expect(screen.queryByText("隐藏内容")).not.toBeInTheDocument();
  });

  it("有 description 时渲染描述", () => {
    render(
      <FormDialogShell open title="标题" description="这是描述" onOpenChange={() => {}}>
        <p>内容</p>
      </FormDialogShell>
    );
    expect(screen.getByText("这是描述")).toBeInTheDocument();
  });

  it("有 error 时渲染错误信息", () => {
    render(
      <FormDialogShell open title="标题" error="校验失败" onOpenChange={() => {}}>
        <p>内容</p>
      </FormDialogShell>
    );
    expect(screen.getByText("校验失败")).toBeInTheDocument();
  });

  it("submitLabel + onSubmit 时渲染取消和提交按钮", () => {
    const onSubmit = vi.fn();
    render(
      <FormDialogShell
        open
        title="标题"
        submitLabel="保存"
        onSubmit={onSubmit}
        onOpenChange={() => {}}
      >
        <p>内容</p>
      </FormDialogShell>
    );
    const saveBtn = screen.getByRole("button", { name: "保存" });
    const cancelBtn = screen.getByRole("button", { name: "取消" });
    expect(saveBtn).toBeInTheDocument();
    expect(cancelBtn).toBeInTheDocument();
    fireEvent.click(saveBtn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("isSubmitting 为 true 时提交按钮显示「保存中...」并禁用", () => {
    render(
      <FormDialogShell
        open
        title="标题"
        submitLabel="保存"
        onSubmit={() => {}}
        isSubmitting
        onOpenChange={() => {}}
      >
        <p>内容</p>
      </FormDialogShell>
    );
    const btn = screen.getByRole("button", { name: "保存中..." });
    expect(btn).toBeDisabled();
  });

  it("自定义 cancelLabel", () => {
    render(
      <FormDialogShell
        open
        title="标题"
        submitLabel="提交"
        cancelLabel="关闭"
        onSubmit={() => {}}
        onOpenChange={() => {}}
      >
        <p>内容</p>
      </FormDialogShell>
    );
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
  });

  it("传入 footer 时使用自定义 footer 而非默认按钮", () => {
    render(
      <FormDialogShell
        open
        title="标题"
        footer={<button type="button">自定义按钮</button>}
        onOpenChange={() => {}}
      >
        <p>内容</p>
      </FormDialogShell>
    );
    expect(screen.getByRole("button", { name: "自定义按钮" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取消" })).not.toBeInTheDocument();
  });

  it("点击取消时调用 onOpenChange(false) 或 onCancel", () => {
    const onOpenChange = vi.fn();
    render(
      <FormDialogShell
        open
        title="标题"
        submitLabel="保存"
        onSubmit={() => {}}
        onOpenChange={onOpenChange}
      >
        <p>内容</p>
      </FormDialogShell>
    );
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
