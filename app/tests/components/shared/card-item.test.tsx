import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CardItem } from "@/components/shared/card-item";

describe("CardItem", () => {
  beforeEach(() => cleanup());

  it("渲染标题和图标", () => {
    render(
      <CardItem
        icon={<span data-testid="icon">图标</span>}
        title="卡片标题"
      />
    );
    expect(screen.getByText("卡片标题")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("有 subtitle 时渲染副标题", () => {
    render(
      <CardItem
        icon={<span>图标</span>}
        title="标题"
        subtitle="副标题描述"
      />
    );
    expect(screen.getByText("副标题描述")).toBeInTheDocument();
  });

  it("有 actions 时渲染操作区", () => {
    render(
      <CardItem
        icon={<span>图标</span>}
        title="标题"
        actions={<button type="button">操作</button>}
      />
    );
    expect(screen.getByRole("button", { name: "操作" })).toBeInTheDocument();
  });

  it("有 footer 时渲染底部内容", () => {
    render(
      <CardItem
        icon={<span>图标</span>}
        title="标题"
        footer={<span>底部内容</span>}
      />
    );
    expect(screen.getByText("底部内容")).toBeInTheDocument();
  });

  it("clickable 为 true 时具有 button 角色", () => {
    render(
      <CardItem
        icon={<span>图标</span>}
        title="可点击卡片"
        clickable
      />
    );
    expect(screen.getByRole("button", { name: /可点击卡片/ })).toBeInTheDocument();
  });

  it("clickable 为 true 时点击触发 onClick", () => {
    const onClick = vi.fn();
    render(
      <CardItem
        icon={<span>图标</span>}
        title="点击测试"
        clickable
        onClick={onClick}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /点击测试/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("支持 className 合并", () => {
    const { container } = render(
      <CardItem
        icon={<span>图标</span>}
        title="标题"
        className="custom-class"
      />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass("custom-class");
  });
});
