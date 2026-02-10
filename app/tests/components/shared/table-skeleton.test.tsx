import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TableSkeleton } from "@/components/shared/table-skeleton";
import { Table, TableBody, TableHeader } from "@/components/ui/table";

describe("TableSkeleton", () => {
  it("默认 rows=5、cols 渲染对应行数列数", () => {
    const { container } = render(
      <Table>
        <TableHeader />
        <TableBody>
          <TableSkeleton cols={3} />
        </TableBody>
      </Table>
    );
    const rows = container.querySelectorAll("tr");
    expect(rows.length).toBe(5);
    rows.forEach((row) => {
      expect(row.querySelectorAll("td").length).toBe(3);
    });
  });

  it("showHeader 为 true 时渲染表头骨架行", () => {
    const { container } = render(
      <Table>
        <TableHeader />
        <TableBody>
          <TableSkeleton cols={2} rows={2} showHeader />
        </TableBody>
      </Table>
    );
    const rows = container.querySelectorAll("tr");
    expect(rows.length).toBe(3); // 1 header row + 2 data rows
  });

  it("自定义 rows 生效", () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableSkeleton cols={1} rows={3} />
        </TableBody>
      </Table>
    );
    const rows = container.querySelectorAll("tr");
    expect(rows.length).toBe(3);
  });
});
