/**
 * CURL 命令生成工具
 * 用于生成可复制的 API 调用命令
 */

import { API_BASE_URL, getAuthToken } from "@/lib/api/config";

/**
 * 获取 API 基础 URL
 */
export function getCurlBaseUrl(): string {
  let base = (API_BASE_URL || "").replace(/\/$/, "");
  if (!base && typeof window !== "undefined") base = window.location.origin;
  if (!base) base = "http://localhost:8000";
  return base.replace(/\/$/, "");
}

/**
 * 转义 body 中的单引号（用于 shell）
 */
function escapeBodyForShell(body: string): string {
  return body.replace(/'/g, "'\\''");
}

export interface BuildCurlOptions {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  url: string;
  body?: unknown;
  token?: string;
}

/**
 * 构建 CURL 命令字符串
 */
export function buildCurlCommand({
  method,
  url,
  body,
  token,
}: BuildCurlOptions): string {
  const authToken = token ?? getAuthToken() ?? "YOUR_TOKEN";
  const lines: string[] = [`curl -X ${method} "${url}"`];
  lines.push('  -H "Accept: */*"');
  lines.push('  -H "Content-Type: application/json"');
  lines.push(`  -H "Authorization: Bearer ${authToken}"`);

  if (body !== undefined && body !== null && method !== "GET") {
    const bodyStr =
      typeof body === "string" ? body : JSON.stringify(body);
    lines.push(`  -d '${escapeBodyForShell(bodyStr)}'`);
  }

  return lines.join(" \\\n");
}
