"use client"

import { Badge } from "@/components/ui/badge"
import { FieldHelp } from "@/components/ui/field-help"
import { cn } from "@/lib/utils"

interface ObjectFieldSectionProps {
  /** 对象字段名，如 llm_config、additional_params */
  title: string
  /** 帮助说明 */
  help?: string
  /** 子内容 */
  children: React.ReactNode
  /** 子内容是否使用 grid 两列布局 */
  grid?: boolean
  className?: string
}

/**
 * 对象字段区块：卡片样式，与 additional_params 等保持一致
 * 标题 + 主色条 + FieldHelp + Badge(object) + 左侧层级边框子内容
 */
export function ObjectFieldSection({
  title,
  help,
  children,
  grid,
  className,
}: ObjectFieldSectionProps) {
  return (
    <div className={cn("border rounded-lg p-4 space-y-4 bg-card shadow-sm", className)}>
      <div className="flex items-center gap-2">
        <div className="w-1 h-4 bg-primary rounded-full" />
        <h3 className="font-semibold text-sm font-mono">{title}</h3>
        {help && <FieldHelp content={help} />}
        <Badge variant="secondary" className="text-xs">
          object
        </Badge>
      </div>
      <div className="pl-4 border-l-2 border-muted-foreground/30 space-y-3">
        {grid ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
