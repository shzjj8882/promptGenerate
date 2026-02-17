/**
 * 工作台布局配置 API
 */

import { apiRequest } from "./config";

/** react-grid-layout 单个布局项 */
export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  static?: boolean;
  /** 多维表格组件：绑定的表格 ID */
  tableId?: string;
}

/** 工作台配置响应 */
export interface DashboardConfigResponse {
  layout: LayoutItem[];
}

/**
 * 获取当前用户的工作台布局配置
 */
export async function getDashboardConfig(): Promise<DashboardConfigResponse> {
  const data = await apiRequest<{ layout: LayoutItem[] }>("/admin/dashboard-config");
  return { layout: data?.layout ?? [] };
}

/**
 * 保存当前用户的工作台布局配置
 */
export async function saveDashboardConfig(layout: LayoutItem[]): Promise<DashboardConfigResponse> {
  const data = await apiRequest<{ layout: LayoutItem[] }>("/admin/dashboard-config", {
    method: "PUT",
    body: JSON.stringify({ layout }),
  });
  return { layout: data?.layout ?? [] };
}
