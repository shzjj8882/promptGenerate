/** 拖拽数据 MIME 类型（侧边栏 -> 网格） */
export const DRAG_DATA_KEY = "application/x-dashboard-widget";

/** 组件类型 */
export type WidgetType = "tables" | "prompts" | "team_code";

/** 组件尺寸 */
export type WidgetSize = "small" | "medium" | "large";

/** 尺寸预设（网格单位，12 列） */
export const SIZE_PRESETS: Record<WidgetSize, { w: number; h: number }> = {
  small: { w: 4, h: 2 },
  medium: { w: 6, h: 3 },
  large: { w: 12, h: 4 },
};

/**
 * 从 layout item 的 i 解析出组件类型
 * 格式: tables-1, prompts-2, team_code-1
 */
export function parseWidgetType(i: string): WidgetType {
  const type = i.split("-")[0];
  if (type === "tables" || type === "prompts" || type === "team_code") {
    return type;
  }
  return "tables";
}
