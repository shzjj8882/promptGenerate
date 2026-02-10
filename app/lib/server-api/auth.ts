"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { buildServerApiUrl, type ApiResponse } from "@/lib/api/config";
import type { UserInfo } from "@/lib/api/auth";

/**
 * 服务端获取当前用户（用于 RBAC 等页面的服务端鉴权）
 * 无 token 或 401 时直接 redirect("/login")，不再返回
 */
export async function getCurrentUserOnServer(): Promise<UserInfo> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) {
    redirect("/login");
  }

  const url = buildServerApiUrl("/admin/auth/me");
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    next: { revalidate: 0 },
  });

  if (res.status === 401) {
    redirect("/login");
  }

  if (!res.ok) {
    throw new Error(`获取用户信息失败：${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as ApiResponse<UserInfo>;
  if (!json.data) {
    throw new Error(json.message ?? "获取用户信息失败");
  }

  return json.data;
}
