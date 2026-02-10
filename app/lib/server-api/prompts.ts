"use server";

import { cookies } from "next/headers";
import { buildServerApiUrl, type ApiResponse } from "@/lib/api/config";
import type { Prompt, GetPromptsParams } from "@/lib/api/prompts";

/**
 * 服务端获取提示词列表（用于提示词管理首屏 SSR）
 */
export async function getPromptsOnServer(
  params: GetPromptsParams = {}
): Promise<Prompt[]> {
  const queryParams = new URLSearchParams();
  if (params.scene) queryParams.append("scene", params.scene);
  if (params.tenant_id) queryParams.append("tenant_id", params.tenant_id);
  if (params.is_default !== undefined) {
    queryParams.append("is_default", params.is_default.toString());
  }
  if (params.skip !== undefined) queryParams.append("skip", params.skip.toString());
  if (params.limit !== undefined) queryParams.append("limit", params.limit.toString());

  const queryString = queryParams.toString();
  const path = `/admin/prompts${queryString ? `?${queryString}` : ""}`;
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
    throw new Error(`获取提示词列表失败：${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as ApiResponse<Prompt[]>;
  if (!json.data) {
    throw new Error(json.message ?? "获取提示词列表失败");
  }

  return json.data;
}

