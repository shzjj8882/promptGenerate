import { ApiError } from "@/lib/api/config";

/**
 * 从异常中取展示文案：若为 ApiError 用其 message，否则用 fallback
 */
export function getDisplayMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}
