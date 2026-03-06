/**
 * TableCanvas 视图工具：单元格格式化、转 Grid 列/行
 */
import type { GridColumn, GridRow, HeaderIconType } from "@/lib/canvas-grid-renderer";
import type { MultiDimensionTable, TableRow as TableRowType } from "@/lib/api/multi-dimension-tables";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ID_COLUMN_WIDTH,
  HEADER_ICON_WIDTH,
  ID_COLUMN_KEY,
  ADD_COLUMN_KEY,
  ADD_COLUMN_WIDTH,
} from "./table-canvas-constants";

export function formatTableCellValue(value: string, columnType?: string): string {
  if (!value) return "";
  if (columnType === "date") return value;
  if (columnType === "multi_select") {
    return [...new Set(value.split(/[,\s]+/).map((v) => v.trim()).filter((v) => v))].join(", ");
  }
  return value;
}

export const COL_TYPE_TO_ICON: Record<string, HeaderIconType> = {
  number: "number",
  date: "date",
  single_select: "single_select",
  multi_select: "multi_select",
  text: "text",
};

export function toGridColumns(
  table: MultiDimensionTable,
  columnWidths: Record<string, number>,
  options?: { onAddColumn?: () => void }
): GridColumn[] {
  const cols = (table?.columns || []).map((col) => ({
    key: col.key,
    width: columnWidths[col.key] ?? DEFAULT_COLUMN_WIDTH,
    headerLabel: col.label,
    headerTextOffset: HEADER_ICON_WIDTH,
    headerIconType: COL_TYPE_TO_ICON[col.type || "text"] ?? "text",
    headerDropdownArrow: false,
  }));
  if (options?.onAddColumn) {
    cols.push({
      key: ADD_COLUMN_KEY,
      width: ADD_COLUMN_WIDTH,
      headerLabel: "",
      headerTextOffset: 0,
      headerIconType: "add_column",
      headerDropdownArrow: false,
    });
  }
  return cols;
}

export function toGridRows(rows: TableRowType[], table: MultiDimensionTable): GridRow[] {
  const colTypes = Object.fromEntries((table?.columns || []).map((c) => [c.key, c.type]));
  return rows.map((row) => ({
    getCellValue: (columnKey: string) =>
      formatTableCellValue(row.cells[columnKey] ?? "", colTypes[columnKey]),
    getRowId: () => row.row_id,
  }));
}

/** 列在视口中的左边缘 X（用于表头下拉/菜单等 overlay 定位） */
export function getColumnLeftInView(
  columnKey: string,
  columns: Array<{ key: string }>,
  columnWidths: Record<string, number>,
  idColumnWidth: number,
  scrollX: number,
  /** 固定列 keys：固定列不随横向滚动，视口位置不加 scrollX */
  pinnedColumnKeys?: string[]
): number {
  const idx = columns.findIndex((c) => c.key === columnKey);
  if (idx < 0) return 0;
  const contentLeft =
    idColumnWidth +
    columns.slice(0, idx).reduce((s, c) => s + (columnWidths[c.key] ?? DEFAULT_COLUMN_WIDTH), 0);
  const isPinned = pinnedColumnKeys?.includes(columnKey);
  return isPinned ? contentLeft : contentLeft - scrollX;
}

export { ID_COLUMN_KEY, ADD_COLUMN_KEY, DEFAULT_COLUMN_WIDTH, DEFAULT_ID_COLUMN_WIDTH };
