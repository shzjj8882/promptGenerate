import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoizedTableRow } from "@/components/shared/memoized-table-row";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Table, TableBody } from "@/components/ui/table";

type RowData = { id: string; name: string };

const columnHelper = createColumnHelper<RowData>();
const columns = [
  columnHelper.accessor("id", { id: "id", header: "ID" }),
  columnHelper.accessor("name", { id: "name", header: "名称" }),
];

function TableWithMemoizedRow({ data }: { data: RowData[] }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <Table>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <MemoizedTableRow key={row.id} row={row} />
        ))}
      </TableBody>
    </Table>
  );
}

describe("MemoizedTableRow", () => {
  it("渲染行内单元格", () => {
    render(<TableWithMemoizedRow data={[{ id: "1", name: "测试" }]} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("测试")).toBeInTheDocument();
  });

  it("多行时每行都渲染", () => {
    const { container } = render(
      <TableWithMemoizedRow
        data={[
          { id: "1", name: "A" },
          { id: "2", name: "B" },
        ]}
      />
    );
    const table = container.querySelector("table");
    expect(table).toBeInTheDocument();
    expect(table!.querySelectorAll("tbody tr").length).toBe(2);
    const cells = table!.querySelectorAll("td");
    const texts = Array.from(cells).map((c) => c.textContent);
    expect(texts).toContain("1");
    expect(texts).toContain("A");
    expect(texts).toContain("2");
    expect(texts).toContain("B");
  });
});
