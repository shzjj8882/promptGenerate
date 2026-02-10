"use server";

import { cookies } from "next/headers";
import { buildServerApiUrl, type ApiResponse } from "@/lib/api/config";
import type { TenantsResponse } from "@/lib/api/tenants";

type GetTenantsParams = {
  skip?: number;
  limit?: number;
  include_deleted?: boolean;
};

/**
 * 服务端获取租户列表（用于 SSR 首屏）
 * 使用 cookie 中的 auth_token 构造 Authorization 头，直接调用后端 /admin/tenants。
 */
export async function getTenantsOnServer(
  params: GetTenantsParams = {}
): Promise<TenantsResponse> {
  const queryParams = new URLSearchParams();
  if (params.skip !== undefined) queryParams.append("skip", params.skip.toString());
  if (params.limit !== undefined) queryParams.append("limit", params.limit.toString());
  if (params.include_deleted !== undefined) {
    queryParams.append("include_deleted", params.include_deleted.toString());
  }

  const queryString = queryParams.toString();
  const path = `/admin/tenants${queryString ? `?${queryString}` : ""}`;
  const url = buildServerApiUrl(path);

  // Next.js 新版 cookies() 为异步 API，需先 await 再读取
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // 使用 React/Next 的 fetch 缓存，在同一次渲染中自动去重（包括 dev 模式的双渲染）
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(`获取租户列表失败：${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as ApiResponse<TenantsResponse>;
  if (!json.data) {
    throw new Error(json.message ?? "获取租户列表失败");
  }

  return json.data;
}

