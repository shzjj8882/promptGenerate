"use client"

import { HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface FieldHelpProps {
  content: string
  className?: string
}

export function FieldHelp({ content, className }: FieldHelpProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          className={`inline-flex cursor-help text-muted-foreground hover:text-foreground ${className ?? ""}`}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLElement).click()}
        >
          <HelpCircle className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
