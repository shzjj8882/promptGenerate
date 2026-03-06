/**
 * TableCanvasModel 纯 JS 测试（无 React、无 DOM）
 * 验证在非 React 状态下仅使用 TableCanvasModel 的可行性。
 */
import { describe, it, expect, vi } from "vitest";
import { TableCanvasModel } from "@/lib/table-canvas-model";
import type { MultiDimensionTable, TableRow, TableColumn } from "@/lib/api/multi-dimension-tables";

function makeTable(overrides?: Partial<MultiDimensionTable>): MultiDimensionTable {
  return {
    id: "t1",
    code: "table1",
    name: "测试表",
    columns: [
      { key: "name", label: "姓名", type: "text" },
      { key: "age", label: "年龄", type: "number" },
    ],
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeRow(overrides: Partial<TableRow> & { row_id: number; cells: Record<string, string> }): TableRow {
  const { row_id, cells, ...rest } = overrides;
  return {
    id: `r-${row_id}`,
    table_id: "t1",
    row_id,
    cells,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...rest,
  };
}

describe("TableCanvasModel (pure JS, no React)", () => {
  it("可在纯 JS 中实例化并 setData", () => {
    const table = makeTable();
    const rows: TableRow[] = [
      makeRow({ row_id: 1, cells: { name: "张三", age: "20" } }),
      makeRow({ row_id: 2, cells: { name: "李四", age: "22" } }),
    ];
    const model = new TableCanvasModel();
    model.setData(table, rows);

    const snap = model.getSnapshot();
    expect(snap.table?.id).toBe("t1");
    expect(snap.rows).toHaveLength(2);
    expect(snap.columns).toHaveLength(2);
    expect(snap.history).toHaveLength(1);
    expect(snap.historyIndex).toBe(0);
    expect(snap.historyInitialized).toBe(true);
    expect(snap.canUndo).toBe(false);
    expect(snap.canRedo).toBe(false);
  });

  it("updateCell 更新数据并记录历史", () => {
    const table = makeTable();
    const rows: TableRow[] = [
      makeRow({ row_id: 1, cells: { name: "张三", age: "20" } }),
    ];
    const model = new TableCanvasModel();
    model.setData(table, rows);

    const rowId = rows[0].id;
    model.updateCell(rowId, "name", "张三丰");

    const snap = model.getSnapshot();
    expect(snap.rows[0].cells.name).toBe("张三丰");
    expect(snap.history).toHaveLength(2);
    expect(snap.historyIndex).toBe(1);
    expect(snap.canUndo).toBe(true);
  });

  it("undo / redo 在纯 JS 下正常工作", () => {
    const table = makeTable();
    const rows: TableRow[] = [
      makeRow({ row_id: 1, cells: { name: "A", age: "1" } }),
    ];
    const model = new TableCanvasModel();
    model.setData(table, rows);
    const rowId = rows[0].id;

    model.updateCell(rowId, "name", "B");
    expect(model.getSnapshot().rows[0].cells.name).toBe("B");

    const okUndo = model.undo();
    expect(okUndo).toBe(true);
    expect(model.getSnapshot().rows[0].cells.name).toBe("A");

    const okRedo = model.redo();
    expect(okRedo).toBe(true);
    expect(model.getSnapshot().rows[0].cells.name).toBe("B");
  });

  it("回调在纯 JS 下被正确触发", () => {
    const table = makeTable();
    const rows: TableRow[] = [
      makeRow({ row_id: 1, cells: { name: "x", age: "1" } }),
    ];
    const onRowChange = vi.fn();
    const onHistoryChange = vi.fn();
    const model = new TableCanvasModel({
      callbacks: { onRowChange, onHistoryChange },
    });
    model.setData(table, rows);
    expect(onRowChange).not.toHaveBeenCalled();
    expect(onHistoryChange).toHaveBeenCalled();

    onHistoryChange.mockClear();
    model.updateCell(rows[0].id, "name", "y");
    expect(onRowChange).toHaveBeenCalledWith(expect.any(Array));
    expect(onRowChange.mock.calls[0][0][0].cells.name).toBe("y");
    expect(onHistoryChange).toHaveBeenCalledWith(
      expect.objectContaining({
        history: expect.any(Array),
        index: 1,
        canUndo: true,
        canRedo: false,
      })
    );
  });

  it("subscribe / getSnapshot 可在纯 JS 中用于驱动外部状态", () => {
    const table = makeTable();
    const rows: TableRow[] = [
      makeRow({ row_id: 1, cells: { name: "a", age: "1" } }),
    ];
    const model = new TableCanvasModel();
    model.setData(table, rows);

    let notified = 0;
    const unsub = model.subscribe(() => {
      notified += 1;
    });
    expect(notified).toBe(0);

    model.updateCell(rows[0].id, "name", "b");
    expect(notified).toBeGreaterThanOrEqual(1);
    expect(model.getSnapshot().rows[0].cells.name).toBe("b");
    const afterFirst = notified;

    unsub();
    model.updateCell(rows[0].id, "name", "c");
    expect(notified).toBe(afterFirst);
    expect(model.getSnapshot().rows[0].cells.name).toBe("c");
  });

  it("getCanvasConfig / getViewConfig 返回默认配置", () => {
    const model = new TableCanvasModel();
    const canvas = model.getCanvasConfig();
    expect(canvas.cellHeight).toBe(40);
    expect(canvas.headerHeight).toBe(40);
    expect(canvas.idColumnKey).toBe("__id__");

    const view = model.getViewConfig();
    expect(view.showScrollbar).toBe(true);
    expect(view.headerParticipatesScroll).toBe(false);
  });
});
