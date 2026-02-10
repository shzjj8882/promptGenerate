import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TableState } from "@/components/shared/table-state";
import { Table, TableBody } from "@/components/ui/table";

describe("TableState", () => {
  const wrap = (node: React.ReactNode) => (
    <Table>
      <TableBody>{node}</TableBody>
    </Table>
  );

  it("loading 时显示 loadingText", () => {
    render(wrap(<TableState loading empty={false} colSpan={3} />));
    expect(screen.getByText("加载中...")).toBeInTheDocument();
  });

  it("loading 时使用自定义 loadingText", () => {
    render(
      wrap(
        <TableState loading empty={false} colSpan={3} loadingText="请求中..." />
      )
    );
    expect(screen.getByText("请求中...")).toBeInTheDocument();
  });

  it("empty 且非 loading 时显示 emptyText", () => {
    render(wrap(<TableState loading={false} empty colSpan={3} />));
    expect(screen.getByText("暂无数据")).toBeInTheDocument();
  });

  it("empty 时使用自定义 emptyText", () => {
    render(
      wrap(
        <TableState loading={false} empty colSpan={3} emptyText="没有记录" />
      )
    );
    expect(screen.getByText("没有记录")).toBeInTheDocument();
  });

  it("非 loading 且非 empty 时渲染 null", () => {
    const { container } = render(
      wrap(<TableState loading={false} empty={false} colSpan={3} />)
    );
    const tbody = container.querySelector("tbody");
    expect(tbody?.children.length).toBe(0);
  });
});
