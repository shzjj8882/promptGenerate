/**
 * 设计规范 - 统一字体层级、配色、卡片布局
 * 用于保持系统整体设计一致性
 */

/** 字体层级：标题、正文、辅助 */
export const TYPOGRAPHY = {
  /** 页面主标题 */
  pageTitle: "text-2xl font-semibold tracking-tight",
  /** 页面副标题/描述 */
  pageSubtitle: "text-sm text-muted-foreground",
  /** 卡片/列表主标题 */
  cardTitle: "text-base font-semibold",
  /** 卡片/列表副标题 */
  cardSubtitle: "text-sm text-muted-foreground",
  /** 正文 */
  body: "text-sm",
  /** 辅助/次要信息 */
  caption: "text-xs text-muted-foreground",
  /** 表格/列表项主文字 */
  listItem: "text-sm font-medium",
  /** 表格/列表项副文字 */
  listItemSecondary: "text-sm text-muted-foreground",
} as const;

/** 卡片图标容器配色（按类型区分，用于 icon + 多行文字 布局） */
export const CARD_ICON_VARIANTS = {
  /** 默认/中性 */
  default: "bg-muted text-muted-foreground",
  /** 主色 */
  primary: "bg-primary/10 text-primary",
  /** 多维表格 - 偏绿色，高亮但不过分抢眼 */
  table: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  /** LLM/对话 - 紫色 */
  chat: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  /** 接口/API - 蓝色 */
  api: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  /** 成功/完成 - 绿色 */
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  /** 警告 - 琥珀色 */
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
} as const;

/** 统一卡片样式类名 */
export const CARD_STYLES = {
  /** 基础卡片容器 */
  base: "rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-border/80",
  /** 列表项卡片（可点击，用于 CardItem 等；布局由使用方覆盖为 grid/flex） */
  listItem: "group rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-border/80",
  /** 内容区卡片（如菜单管理树容器） */
  content: "rounded-xl border border-border bg-card p-5",
} as const;
