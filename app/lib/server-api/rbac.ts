"use server";

import { cookies } from "next/headers";
import { buildServerApiUrl, type ApiResponse } from "@/lib/api/config";
import type { RolesResponse } from "@/lib/api/rbac";
import type { PermissionsGroupedRawResponse } from "@/lib/api/rbac";
import { ServerApiError } from "./errors";

type GetRolesParams = {
  skip?: number;
  limit?: number;
  is_active?: boolean;
};

/**
 * 服务端获取角色列表（用于权限管理页 SSR 首屏）
 */
export async function getRolesOnServer(
  params: GetRolesParams = {}
): Promise<RolesResponse> {
  const queryParams = new URLSearchParams();
  if (params.skip !== undefined) queryParams.append("skip", params.skip.toString());
  if (params.limit !== undefined) queryParams.append("limit", params.limit.toString());
  if (params.is_active !== undefined) {
    queryParams.append("is_active", params.is_active.toString());
  }

  const queryString = queryParams.toString();
  const path = `/admin/rbac/roles${queryString ? `?${queryString}` : ""}`;
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
    throw new ServerApiError(
      `获取角色列表失败：${res.status} ${res.statusText}`,
      res.status
    );
  }

  const json = (await res.json()) as ApiResponse<RolesResponse>;
  if (!json.data) {
    throw new ServerApiError(json.message ?? "获取角色列表失败", res.status);
  }

  return json.data;
}

type GetPermissionsGroupedParams = {
  is_active?: boolean;
};

/**
 * 服务端获取权限分组（平铺 + resource_order/labels，前端用 groupBy 组合）
 */
export async function getPermissionsGroupedOnServer(
  params: GetPermissionsGroupedParams = {}
): Promise<PermissionsGroupedRawResponse> {
  const queryParams = new URLSearchParams();
  if (params.is_active !== undefined) {
    queryParams.append("is_active", params.is_active.toString());
  }
  const q = queryParams.toString();
  const path = `/admin/rbac/permissions/grouped${q ? `?${q}` : ""}`;
  const url = buildServerApiUrl(path);

  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new ServerApiError(
      `获取权限列表失败：${res.status} ${res.statusText}`,
      res.status
    );
  }

  const json = (await res.json()) as ApiResponse<PermissionsGroupedRawResponse>;
  if (!json.data) {
    throw new ServerApiError(json.message ?? "获取权限列表失败", res.status);
  }

  return json.data;
}
