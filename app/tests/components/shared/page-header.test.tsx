import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "@/components/shared/page-header";

describe("PageHeader", () => {
  it("渲染标题", () => {
    render(<PageHeader title="测试标题" />);
    expect(screen.getByRole("heading", { level: 2, name: "测试标题" })).toBeInTheDocument();
  });

  it("有 description 时渲染描述", () => {
    render(
      <PageHeader title="标题" description="这是描述" />
    );
    expect(screen.getByText("这是描述")).toBeInTheDocument();
  });

  it("description 为 undefined 时不渲染描述段落", () => {
    const { container } = render(<PageHeader title="标题" />);
    const desc = container.querySelector(".text-muted-foreground");
    expect(desc).toBeNull();
  });

  it("传入 action 时渲染在右侧", () => {
    render(
      <PageHeader
        title="标题"
        action={<button type="button">操作</button>}
      />
    );
    expect(screen.getByRole("button", { name: "操作" })).toBeInTheDocument();
  });

  it("支持 className 合并", () => {
    const { container } = render(
      <PageHeader title="标题" className="custom-class" />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass("custom-class");
  });
});
