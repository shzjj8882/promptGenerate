/**
 * 字符串工具函数
 */

/**
 * 标准化字符串用于匹配（去除空格、转小写）
 */
export function normalize(str: string | null | undefined): string {
  if (!str) return "";
  return String(str).trim().toLowerCase();
}

/**
 * 从 label 生成列 key（将中文和特殊字符转换为安全的 key）
 * @param label 列标题
 * @param existingKeys 已存在的 key 集合，用于避免重复
 */
export function generateKeyFromLabel(
  label: string,
  existingKeys: Set<string>
): string {
  let key = label.trim();

  // 如果已是有效的 key 格式且不重复，直接使用
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) && !existingKeys.has(key)) {
    return key;
  }

  // 否则生成基于 label 的 key
  key = key
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();

  if (!key || !/^[a-zA-Z_]/.test(key)) {
    key = "col_" + key;
  }

  let finalKey = key;
  let counter = 1;
  while (existingKeys.has(finalKey)) {
    finalKey = `${key}_${counter}`;
    counter++;
  }
  return finalKey;
}
