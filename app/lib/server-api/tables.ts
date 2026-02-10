"use server";

import { cookies } from "next/headers";
import { buildServerApiUrl, type ApiResponse } from "@/lib/api/config";
import type { PaginatedTablesResponse, GetTablesParams, MultiDimensionTable } from "@/lib/api/multi-dimension-tables";

/**
 * 服务端获取多维表格列表（用于多维表格管理首屏 SSR）
 */
export async function getTablesOnServer(
  params: GetTablesParams = {}
): Promise<PaginatedTablesResponse> {
  const queryParams = new URLSearchParams();
  if (params.team_id) queryParams.append("team_id", params.team_id);
  if (params.skip !== undefined) queryParams.append("skip", params.skip.toString());
  if (params.limit !== undefined) queryParams.append("limit", params.limit.toString());

  const queryString = queryParams.toString();
  const path = `/admin/multi-dimension-tables${queryString ? `?${queryString}` : ""}`;
  const url = buildServerApiUrl(path);

  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`获取表格列表失败：${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as ApiResponse<PaginatedTablesResponse>;
  if (!json.data) {
    throw new Error(json.message ?? "获取表格列表失败");
  }

  return json.data;
}

/**
 * 服务端获取多维表格详情（包含行数据，用于表格详情页 SSR）
 */
export async function getTableOnServer(
  tableId: string,
  includeRows: boolean = true
): Promise<MultiDimensionTable> {
  const queryParams = new URLSearchParams();
  if (includeRows) {
    queryParams.append("include_rows", "true");
  }
  const queryString = queryParams.toString();
  const path = `/admin/multi-dimension-tables/${tableId}${queryString ? `?${queryString}` : ""}`;
  const url = buildServerApiUrl(path);

  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`获取表格详情失败：${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as ApiResponse<MultiDimensionTable>;
  if (!json.data) {
    throw new Error(json.message ?? "获取表格详情失败");
  }

  return json.data;
}
