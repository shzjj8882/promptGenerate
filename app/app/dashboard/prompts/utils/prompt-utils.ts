/**
 * 提示词工具函数
 */

import type { PromptScene, Prompt, Placeholder } from "../prompts-client";

/**
 * 占位符类型
 */
export type PlaceholderType = "input" | "table";

/**
 * 解析后的占位符信息
 */
export interface ParsedPlaceholder {
  type: PlaceholderType;
  key: string;
  rowIdKey?: string; // 仅用于 table 类型
  originalText: string; // 原始文本，如 {input.userName} 或 {table.customerName.row_id}
}

/**
 * 从文本中解析占位符（支持新格式和旧格式）
 * 新格式：
 * - 用户输入：{input.key} 或 {input.label}
 * - 多维表格：{table.key.row_id} 或 {table.label.row_id}
 * 旧格式（兼容）：
 * - {key} 或 {label}
 */
export function parsePlaceholdersFromText(text: string): string[] {
  const regex = /\{([^{}]+)\}/g;
  const result = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    result.add(match[1]);
  }
  return Array.from(result);
}

/**
 * 解析占位符详细信息
 * 新格式：统一为 {key}，不再区分 input 和 table 前缀
 * 类型（input 或 table）由占位符配置（data_source_type）决定
 */
export function parsePlaceholderDetails(text: string): ParsedPlaceholder | null {
  const match = text.match(/^\{([^{}]+)\}$/);
  if (!match) return null;
  
  const content = match[1];
  
  // 兼容旧格式：{input.key} 或 {table.key.row_id}
  if (content.startsWith("input.")) {
    const key = content.substring(6); // 去掉 "input."
    return {
      type: "input",
      key,
      originalText: `{${content}}`,
    };
  }
  
  if (content.startsWith("table.")) {
    const parts = content.substring(6).split("."); // 去掉 "table."
    if (parts.length >= 2) {
      const key = parts[0];
      const rowIdKey = parts.slice(1).join("."); // 支持 row_id 中包含点号的情况
      return {
        type: "table",
        key,
        rowIdKey,
        originalText: `{${content}}`,
      };
    }
  }
  
  // 新格式：{key} - 类型由占位符配置决定
  // 这里暂时返回 input 类型，实际类型需要根据占位符配置来判断
  return {
    type: "input", // 默认类型，实际类型需要根据占位符配置来判断
    key: content,
    originalText: `{${content}}`,
  };
}

/**
 * 根据占位符生成占位符文本
 * 统一格式：{key}，不再区分 input 和 table 前缀
 * 后端会根据占位符配置（data_source_type）来决定如何获取值
 */
export function formatPlaceholderText(
  placeholder: Placeholder,
  rowIdParamKey?: string
): string {
  // 统一格式：直接使用 key，格式为 {key}
  return `{${placeholder.key}}`;
}

/**
 * 检查是否需要租户信息
 */
export function checkIfTenantRequired(
  content: string,
  placeholders: string[]
): boolean {
  const contentPlaceholders = parsePlaceholdersFromText(content);
  const allPlaceholders = Array.from(
    new Set([...placeholders, ...contentPlaceholders])
  );

  // 检查是否包含需要租户信息的占位符
  const tenantRelatedKeys: string[] = [];

  return allPlaceholders.some((ph) => {
    const key = ph.toLowerCase();
    return tenantRelatedKeys.some((tenantKey) => key.includes(tenantKey.toLowerCase()));
  });
}

/**
 * 检查占位符是否自动获取
 */
export function isAutoFetchedPlaceholder(
  placeholderValue: string,
  placeholderLabel?: string
): boolean {
  const autoFetchedKeys = [
    "conversationId",
    "customRagInfos",
  ];

  const value = (placeholderValue || "").toLowerCase();
  const label = (placeholderLabel || "").toLowerCase();

  return autoFetchedKeys.some((key) => {
    const keyLower = key.toLowerCase();
    return value.includes(keyLower) || label.includes(keyLower);
  });
}

/**
 * 获取场景标签
 */
export function getSceneLabel(scene: PromptScene, includeBadge = false): string {
  const sceneLabels: Record<string, string> = {
    research: "研究报告",
    ppt_report: "PPT报告",
    sales_order: "销售订单",
  };

  const label = sceneLabels[scene] || scene;
  
  if (includeBadge) {
    return `[${label}]`;
  }
  
  return label;
}
