"use server";

import { cookies } from "next/headers";
import { buildServerApiUrl, type ApiResponse } from "@/lib/api/config";
import type { UsersResponse } from "@/lib/api/users";
import { ServerApiError } from "./errors";

type GetUsersParams = {
  skip?: number;
  limit?: number;
  is_active?: boolean;
};

/**
 * 服务端获取用户列表（用于权限管理页 SSR 首屏）
 */
export async function getUsersOnServer(
  params: GetUsersParams = {}
): Promise<UsersResponse> {
  const queryParams = new URLSearchParams();
  if (params.skip !== undefined) queryParams.append("skip", params.skip.toString());
  if (params.limit !== undefined) queryParams.append("limit", params.limit.toString());
  if (params.is_active !== undefined) {
    queryParams.append("is_active", params.is_active.toString());
  }

  const queryString = queryParams.toString();
  const path = `/admin/auth/users${queryString ? `?${queryString}` : ""}`;
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
      `获取用户列表失败：${res.status} ${res.statusText}`,
      res.status
    );
  }

  const json = (await res.json()) as ApiResponse<UsersResponse>;
  if (!json.data) {
    throw new ServerApiError(json.message ?? "获取用户列表失败", res.status);
  }

  return json.data;
}

/**
 * 服务端获取用户当前的角色 ID 列表
 */
export async function getUserRolesOnServer(userId: string): Promise<string[]> {
  const path = `/admin/rbac/users/${userId}/roles`;
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
      `获取用户角色失败：${res.status} ${res.statusText}`,
      res.status
    );
  }

  const json = (await res.json()) as ApiResponse<string[]>;
  if (!json.data) {
    throw new ServerApiError(json.message ?? "获取用户角色失败", res.status);
  }

  return json.data;
}

/**
 * 服务端批量获取用户角色 ID，返回 { user_id: role_id[] }，一次请求替代 N 次 getUserRolesOnServer
 */
export async function getUserRolesBatchOnServer(
  userIds: string[]
): Promise<Record<string, string[]>> {
  if (userIds.length === 0) return {};

  const path = "/admin/rbac/users/roles-batch";
  const url = buildServerApiUrl(path);

  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ user_ids: userIds }),
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new ServerApiError(
      `批量获取用户角色失败：${res.status} ${res.statusText}`,
      res.status
    );
  }

  const json = (await res.json()) as ApiResponse<Record<string, string[]>>;
  if (json.data === undefined) {
    throw new ServerApiError(json.message ?? "批量获取用户角色失败", res.status);
  }

  return json.data;
}
