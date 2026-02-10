/**
 * 预定义的占位符列表（所有场景都可以选择使用）
 * 统一管理，避免在多个文件中重复定义
 */
export const PREDEFINED_PLACEHOLDERS = [
  {
    key: "conversationId",
    label: "系统对话ID",
    description: "当前对话的唯一标识符，由系统自动生成",
  },
  {
    key: "customRagInfos",
    label: "客户历史数据",
    description: "客户商机分析表的历史最新内容，记录现有客户的最新历史信息",
  },
  {
    key: "userName",
    label: "销售姓名",
    description: "销售自己的姓名，禁止出现在商机分析表中",
  },
] as const;
