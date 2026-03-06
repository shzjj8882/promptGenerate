/**
 * TableCanvas 视图常量与列宽持久化
 */
export const CELL_HEIGHT = 40;
export const HEADER_HEIGHT = 40;
export const ID_COLUMN_KEY = "__id__";
export const ADD_COLUMN_KEY = "__add_column__";
export const ADD_COLUMN_WIDTH = 40;
export const DEFAULT_COLUMN_WIDTH = 150;
export const DEFAULT_ID_COLUMN_WIDTH = 120;
export const HEADER_ICON_WIDTH = 24;
export const SCROLLBAR_SIZE = 12;
export const HEADER_DROPDOWN_RIGHT_GAP = 10;
export const HEADER_DROPDOWN_BUTTON_WIDTH = 32;

const COLUMN_WIDTHS_STORAGE_PREFIX = "table-column-widths-";
const PINNED_COLUMNS_STORAGE_PREFIX = "table-pinned-columns-";
const HIDDEN_COLUMNS_STORAGE_PREFIX = "table-hidden-columns-";

export function getColumnWidthsStorageKey(tableId: string): string {
  return `${COLUMN_WIDTHS_STORAGE_PREFIX}${tableId}`;
}

export function getPinnedColumnsStorageKey(tableId: string): string {
  return `${PINNED_COLUMNS_STORAGE_PREFIX}${tableId}`;
}

export function getHiddenColumnsStorageKey(tableId: string): string {
  return `${HIDDEN_COLUMNS_STORAGE_PREFIX}${tableId}`;
}

export function loadColumnWidthsFromStorage(tableId: string): Record<string, number> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getColumnWidthsStorageKey(tableId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveColumnWidthsToStorage(tableId: string, widths: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getColumnWidthsStorageKey(tableId), JSON.stringify(widths));
  } catch {
    /* ignore */
  }
}

export function loadPinnedColumnsFromStorage(tableId: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getPinnedColumnsStorageKey(tableId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function savePinnedColumnsToStorage(tableId: string, keys: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getPinnedColumnsStorageKey(tableId), JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}

export function loadHiddenColumnsFromStorage(tableId: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getHiddenColumnsStorageKey(tableId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveHiddenColumnsToStorage(tableId: string, keys: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getHiddenColumnsStorageKey(tableId), JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}
