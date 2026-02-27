"use client"

import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { FieldHelp } from "@/components/ui/field-help"
import { cn } from "@/lib/utils"

interface ApiFieldLabelProps {
  /** 字段 key，如 user_message、model_id */
  keyName: string
  /** 帮助说明 */
  help?: string
  /** 类型 Badge 文案，如 string、number、object */
  typeBadge?: string
  /** Badge 样式：secondary 用于顶层，outline 用于嵌套 */
  badgeVariant?: "secondary" | "outline"
  /** 是否必填，显示红色 * */
  required?: boolean
  /** 是否显示「可选」文案 */
  optional?: boolean
  /** 嵌套字段样式（muted） */
  nested?: boolean
  /** htmlFor 绑定 */
  htmlFor?: string
  className?: string
}

/**
 * API 风格表单字段标签：key + FieldHelp + Badge
 * 用于接口参数、Body 等表单的字段标题行
 */
export function ApiFieldLabel({
  keyName,
  help,
  typeBadge,
  badgeVariant = "secondary",
  required,
  optional,
  nested,
  htmlFor,
  className,
}: ApiFieldLabelProps) {
  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <Label
        htmlFor={htmlFor}
        className={cn(
          "text-xs font-mono",
          nested && "text-muted-foreground"
        )}
      >
        {keyName}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {help && <FieldHelp content={help} />}
      {typeBadge && (
        <Badge variant={badgeVariant} className="text-xs">
          {typeBadge}
        </Badge>
      )}
      {optional && (
        <span className="text-xs text-muted-foreground">可选</span>
      )}
    </div>
  )
}
