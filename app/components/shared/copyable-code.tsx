"use client";

import { Button } from "@/components/ui/button";
import { Check, Copy } from "@/components/icons";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

interface CopyableCodeProps {
  /** 完整值（用于复制） */
  value?: string | null;
  /** 展示时截断长度，默认 8 */
  displayLength?: number;
  /** 未生成时的占位文案 */
  placeholder?: string;
  className?: string;
}

/**
 * 可复制的代码/认证码展示组件
 * 支持点击复制到剪贴板，复制成功后短暂显示勾选图标
 */
export function CopyableCode({
  value,
  displayLength = 8,
  placeholder = "未生成",
  className,
}: CopyableCodeProps) {
  const { copied, copy } = useCopyToClipboard({ resetDelay: 2000 });

  const handleCopy = () => value && copy(value);

  if (!value) {
    return <span className={cn("text-sm text-muted-foreground", className)}>{placeholder}</span>;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
        {value.length > displayLength ? `${value.substring(0, displayLength)}...` : value}
      </code>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={handleCopy}
        title="复制"
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}
