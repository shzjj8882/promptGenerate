import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ObjectFieldSection } from "@/components/shared/object-field-section";

describe("ObjectFieldSection", () => {
  it("渲染标题和 object Badge", () => {
    render(
      <ObjectFieldSection title="llm_config">
        <p>子内容</p>
      </ObjectFieldSection>
    );
    expect(screen.getByRole("heading", { name: "llm_config" })).toBeInTheDocument();
    expect(screen.getByText("object")).toBeInTheDocument();
    expect(screen.getByText("子内容")).toBeInTheDocument();
  });

  it("有 help 时渲染 FieldHelp", () => {
    render(
      <ObjectFieldSection title="title" help="帮助说明">
        <p>内容</p>
      </ObjectFieldSection>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("grid 为 true 时子内容使用 grid 布局", () => {
    const { container } = render(
      <ObjectFieldSection title="title" grid>
        <div>子项1</div>
        <div>子项2</div>
      </ObjectFieldSection>
    );
    const grid = container.querySelector(".grid");
    expect(grid).toBeInTheDocument();
    expect(screen.getByText("子项1")).toBeInTheDocument();
    expect(screen.getByText("子项2")).toBeInTheDocument();
  });

  it("grid 为 false 时子内容直接渲染", () => {
    render(
      <ObjectFieldSection title="title">
        <p>直接子内容</p>
      </ObjectFieldSection>
    );
    expect(screen.getByText("直接子内容")).toBeInTheDocument();
  });
});
