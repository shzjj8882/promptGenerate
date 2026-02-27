/**
 * 多维表格相关 API
 */

import { apiRequest } from "./config";

export interface TableColumn {
  key: string;
  label: string;
  type?: string; // 字段类型：text（文本）、number（数字）、date（日期）、boolean（布尔值）、select（选择）等
  options?: Record<string, any>; // 字段选项（如选择类型的选项列表、数字类型的范围等）
}

export interface MultiDimensionTable {
  id: string;
  code: string;
  name: string;
  description?: string;
  team_id?: string;
  team_code?: string;
  columns: TableColumn[];
  row_count?: number;  // 行数统计
  rows?: TableRow[];  // 行数据（可选，当 include_rows=true 时返回，或更新表格时返回）
  is_active: boolean;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

export interface MultiDimensionTableCreate {
  code: string;
  name: string;
  description?: string;
  columns: TableColumn[];
}

export interface MultiDimensionTableUpdate {
  code?: string;
  name?: string;
  description?: string;
  columns?: TableColumn[];
  rows?: TableRowBulkData[]; // 可选，如果提供则全量替换所有行
  deleted_row_ids?: string[]; // 可选，通常与 rows 一起使用
}

export interface TableRow {
  id: string;
  table_id: string;
  row_id: number;
  team_id?: string;
  team_code?: string;
  row_data?: Record<string, unknown>;
  cells: Record<string, string>;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
  /** 本地标记删除，保存时排除 */
  _deleted?: boolean;
}

export interface TableRowCreate {
  // table_id 已在 URL 路径中，不需要在请求体中
  row_id?: number; // 可选，如果不提供则自动生成
  row_data?: Record<string, any>;
  cells: Record<string, string>;
}

export interface TableRowUpdate {
  row_data?: Record<string, any>;
  cells?: Record<string, string>;
}

export interface TableRowBulkData {
  id?: string; // 如果提供则更新，否则创建
  row_id?: number; // 可选，如果不提供则自动生成
  row_data?: Record<string, any>;
  cells: Record<string, string>;
}

export interface TableRowsBulkSave {
  rows: TableRowBulkData[];
  deleted_row_ids: string[];
}

export interface TableSearchRequest {
  table_id: string;
  row_id?: number;
  column_key?: string;
  value?: string;
  team_id?: string;
}

export interface TableSearchResponse {
  rows: TableRow[];
  total: number;
}

export interface GetTablesParams {
  team_id?: string;
  skip?: number;
  limit?: number;
}

export interface PaginatedTablesResponse {
  items: MultiDimensionTable[];
  total: number;
  skip: number;
  limit: number;
}

export async function getTables(params?: GetTablesParams): Promise<PaginatedTablesResponse> {
  const queryParams = new URLSearchParams();
  if (params?.team_id) queryParams.append("team_id", params.team_id);
  if (params?.skip !== undefined) queryParams.append("skip", params.skip.toString());
  if (params?.limit !== undefined) queryParams.append("limit", params.limit.toString());
  const queryString = queryParams.toString();
  return apiRequest<PaginatedTablesResponse>(`/admin/multi-dimension-tables${queryString ? `?${queryString}` : ""}`);
}

export async function getTable(tableId: string, includeRows: boolean = false): Promise<MultiDimensionTable> {
  const queryParams = new URLSearchParams();
  if (includeRows) {
    queryParams.append("include_rows", "true");
  }
  const queryString = queryParams.toString();
  return apiRequest<MultiDimensionTable>(`/admin/multi-dimension-tables/${tableId}${queryString ? `?${queryString}` : ""}`);
}

export async function createTable(data: MultiDimensionTableCreate): Promise<MultiDimensionTable> {
  return apiRequest<MultiDimensionTable>("/admin/multi-dimension-tables", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateTable(tableId: string, data: MultiDimensionTableUpdate): Promise<MultiDimensionTable> {
  return apiRequest<MultiDimensionTable>(`/admin/multi-dimension-tables/${tableId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteTable(tableId: string): Promise<void> {
  return apiRequest<void>(`/admin/multi-dimension-tables/${tableId}`, {
    method: "DELETE",
  });
}

export async function getTableRows(tableId: string, team_id?: string): Promise<TableRow[]> {
  const queryParams = new URLSearchParams();
  if (team_id) queryParams.append("team_id", team_id);
  const queryString = queryParams.toString();
  return apiRequest<TableRow[]>(`/admin/multi-dimension-tables/${tableId}/rows${queryString ? `?${queryString}` : ""}`);
}

export async function createTableRow(tableId: string, data: TableRowCreate): Promise<TableRow> {
  return apiRequest<TableRow>(`/admin/multi-dimension-tables/${tableId}/rows`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateTableRow(tableId: string, rowId: string, data: TableRowUpdate): Promise<TableRow> {
  return apiRequest<TableRow>(`/admin/multi-dimension-tables/${tableId}/rows/${rowId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteTableRow(tableId: string, rowId: string): Promise<void> {
  return apiRequest<void>(`/admin/multi-dimension-tables/${tableId}/rows/${rowId}`, {
    method: "DELETE",
  });
}

/** 条件：column_key + value */
export interface TableRowCondition {
  column_key: string;
  value: string;
}

/** 按条件删除 */
export interface TableRowDeleteByConditionRequest {
  condition: TableRowCondition;
}

/** 按条件更新 */
export interface TableRowUpdateByConditionRequest {
  condition: TableRowCondition;
  cells?: Record<string, string>;
  row_data?: Record<string, unknown>;
}

export async function deleteTableRowByCondition(
  tableId: string,
  data: TableRowDeleteByConditionRequest
): Promise<{ deleted_count: number; deleted_row_ids: string[] }> {
  return apiRequest<{ deleted_count: number; deleted_row_ids: string[] }>(
    `/admin/multi-dimension-tables/${tableId}/rows/by-condition`,
    {
      method: "DELETE",
      body: JSON.stringify(data),
    }
  );
}

export async function updateTableRowByCondition(
  tableId: string,
  data: TableRowUpdateByConditionRequest
): Promise<{ updated_count: number; updated_row_ids: string[] }> {
  return apiRequest<{ updated_count: number; updated_row_ids: string[] }>(
    `/admin/multi-dimension-tables/${tableId}/rows/by-condition`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    }
  );
}

/** 多条件查询中的单个条件 */
export interface TableRowQueryCondition {
  column_key: string;
  operator?: string; // equals | contains | not_equals | not_contains | starts_with | ends_with
  value: string;
}

/** 多条件查询请求 */
export interface TableRowQueryByConditionsRequest {
  conditions: TableRowQueryCondition[];
  logic?: "and" | "or";
  limit?: number; // 1 表示只返回单条
}

/** 多条件查询响应 */
export interface TableRowQueryByConditionsResponse {
  rows: TableRow[];
  total: number;
  row?: TableRow | null; // limit=1 时返回单条
}

export async function queryTableRowsByConditions(
  tableId: string,
  data: TableRowQueryByConditionsRequest
): Promise<TableRowQueryByConditionsResponse> {
  return apiRequest<TableRowQueryByConditionsResponse>(
    `/admin/multi-dimension-tables/${tableId}/rows/query-by-conditions`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

export async function bulkSaveTableRows(tableId: string, data: TableRowsBulkSave): Promise<TableRow[]> {
  return apiRequest<TableRow[]>(`/admin/multi-dimension-tables/${tableId}/rows/bulk`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function searchTable(data: TableSearchRequest): Promise<TableSearchResponse> {
  return apiRequest<TableSearchResponse>("/admin/multi-dimension-tables/search", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
