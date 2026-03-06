"use client";

import { cn } from "@/lib/utils";
import { CARD_ICON_VARIANTS, CARD_STYLES, TYPOGRAPHY } from "@/lib/design-tokens";

type IconVariant = keyof typeof CARD_ICON_VARIANTS;

interface CardItemProps {
  /** 左侧图标（React 节点） */
  icon: React.ReactNode;
  /** 图标配色变体 */
  iconVariant?: IconVariant;
  /** 主标题 */
  title: React.ReactNode;
  /** 副标题/描述 */
  subtitle?: React.ReactNode;
  /** 右侧操作区 */
  actions?: React.ReactNode;
  /** 底部内容（如 Badge 列表） */
  footer?: React.ReactNode;
  /** 是否可点击 */
  clickable?: boolean;
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

/**
 * 统一卡片项布局：icon 高度占 100%，多行文字有合理层级
 * 遵循设计规范：icon + 多行文字 原则
 */
export function CardItem({
  icon,
  iconVariant = "primary",
  title,
  subtitle,
  actions,
  footer,
  clickable = false,
  className,
  children,
  onClick,
  onDoubleClick,
}: CardItemProps) {
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onDoubleClick={clickable ? onDoubleClick : undefined}
      className={cn(
        CARD_STYLES.listItem,
        // Grid：左列 icon，右列 文本+操作；行高由右侧内容决定
        "grid grid-cols-[auto_1fr] items-stretch gap-4",
        clickable && "cursor-pointer",
        className
      )}
    >
      {/* 图标区：Grid 左列，单元格高度 = 行高；内层 h-full + aspect-square => 严格正方形 */}
      <div className="flex min-h-14 items-center justify-center self-stretch">
        <div
          className={cn(
            "flex aspect-square h-full min-w-14 min-h-14 items-center justify-center rounded-lg",
            CARD_ICON_VARIANTS[iconVariant]
          )}
        >
          {icon}
        </div>
      </div>
      {/* 右侧：文字 + 操作同一块，保证整行只有一列决定高度 */}
      <div className="flex min-w-0 items-stretch justify-between gap-4">
        <div className="flex flex-col justify-center gap-0.5 py-0.5 min-w-0">
          <div className={cn(TYPOGRAPHY.cardTitle, "truncate")}>{title}</div>
          {subtitle && <div className={cn(TYPOGRAPHY.cardSubtitle, "line-clamp-2")}>{subtitle}</div>}
          {footer && <div className="mt-3 flex flex-wrap gap-1.5">{footer}</div>}
          {children}
        </div>
        {actions && <div className="shrink-0 self-start">{actions}</div>}
      </div>
    </div>
  );
}
