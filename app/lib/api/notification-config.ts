/**
 * 通知配置 API
 */
import { buildApiUrl, getAuthToken } from "./config";

export interface NotificationConfigItem {
  id: string;
  type: string;
  name: string;
}

export interface NotificationConfigListItem {
  id: string;
  type: string;
  name: string;
  is_configured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationConfigDetail {
  id: string;
  type: string;
  name: string;
  config?: Record<string, unknown>;
  is_active: boolean;
  team_id?: string;
  created_at: string;
  updated_at: string;
}

/**
 * 获取通知配置列表（用于通知中心页面）
 */
export async function getNotificationConfigs(): Promise<NotificationConfigListItem[]> {
  const url = buildApiUrl("/admin/notification-config");
  const token = getAuthToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  return result.data?.items ?? [];
}

/**
 * 获取通知配置详情
 * @param forEdit 编辑时传 true，返回完整 config（含 api_key）
 */
export async function getNotificationConfig(
  id: string,
  forEdit?: boolean
): Promise<NotificationConfigDetail> {
  const url = buildApiUrl(
    `/admin/notification-config/${id}${forEdit ? "?for_edit=true" : ""}`
  );
  const token = getAuthToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 更新通知配置
 */
export async function updateNotificationConfig(
  id: string,
  data: { name?: string; config?: Record<string, unknown>; is_active?: boolean }
): Promise<NotificationConfigDetail> {
  const url = buildApiUrl(`/admin/notification-config/${id}`);
  const token = getAuthToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 使用传入配置测试发送邮件（编辑时使用当前表单数据）
 */
export async function testEmailWithConfig(params: {
  api_user: string;
  api_key: string;
  from_email: string;
  from_name?: string;
  email_to: string;
}): Promise<{ message: string }> {
  const url = buildApiUrl("/admin/notification-config/test-email-with-config");
  const token = getAuthToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      api_user: params.api_user,
      api_key: params.api_key,
      from_email: params.from_email,
      from_name: params.from_name ?? "",
      email_to: params.email_to,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || error.message || `HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 测试发送邮件（使用已保存的配置）
 */
export async function testEmailNotification(
  configId: string,
  emailTo: string
): Promise<{ message: string }> {
  const url = buildApiUrl(`/admin/notification-config/${configId}/test-email`);
  const token = getAuthToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ email_to: emailTo }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || error.message || `HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 获取用于调试的通知配置列表（已配置且可用的）
 */
export async function getNotificationConfigsForDebug(): Promise<NotificationConfigItem[]> {
  const url = buildApiUrl("/admin/notification-config/list-for-debug");
  const token = getAuthToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  return result.data?.items ?? [];
}
