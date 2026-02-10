import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SortIcon } from "@/components/shared/sort-icon";

describe("SortIcon", () => {
  it("sorted 为 false 时渲染未排序图标", () => {
    const { container } = render(<SortIcon sorted={false} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("sorted 为 asc 时渲染升序图标", () => {
    const { container } = render(<SortIcon sorted="asc" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it("sorted 为 desc 时渲染降序图标", () => {
    const { container } = render(<SortIcon sorted="desc" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it("支持自定义 className", () => {
    const { container } = render(
      <SortIcon sorted="asc" className="custom-icon" />
    );
    const el = container.querySelector(".custom-icon");
    expect(el).toBeInTheDocument();
  });
});
