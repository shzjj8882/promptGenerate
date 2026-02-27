/**
 * 占位符面板相关类型
 */

import type { Placeholder } from "../../prompts-client";
import type { ParsedPlaceholder } from "../../utils/prompt-utils";
import type { TableColumn } from "@/lib/api/multi-dimension-tables";

/** 解析后的占位符（含配置） */
export interface ParsedPlaceholderWithConfig extends ParsedPlaceholder {
  placeholder?: Placeholder;
}

/** 占位符面板展示变体 */
export type PlaceholderPanelVariant = "api" | "chat" | "simple";

/** 可用列（含 row_id） */
export interface AvailableColumn extends TableColumn {
  key: string;
  label: string;
}
