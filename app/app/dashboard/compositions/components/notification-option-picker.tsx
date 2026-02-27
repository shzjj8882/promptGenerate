"use client";

import { useEffect } from "react";
import { CircleSlash, FileCode, Paperclip, FileText } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** 通知方式：无 | 邮件(HTML) | 邮件(文件) | 邮件(纯文本) */
export type NotificationOption = "none" | "email:html" | "email:file" | "email:plain";

const NONE_OPTION = { value: "none" as const, label: "无", icon: CircleSlash, isNone: true };
const EMAIL_OPTIONS: { value: NotificationOption; label: string; icon: React.ElementType; desc?: string }[] = [
  { value: "email:html", label: "邮件（HTML）", icon: FileCode, desc: "富文本格式" },
  { value: "email:file", label: "邮件（文件）", icon: Paperclip, desc: "作为附件发送" },
  { value: "email:plain", label: "邮件（纯文本）", icon: FileText, desc: "纯文本格式" },
];

interface NotificationOptionPickerProps {
  value: NotificationOption;
  onChange: (v: NotificationOption) => void;
  /** 是否有可用的邮件配置，无配置时仅显示「无」 */
  hasEmailConfig?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function NotificationOptionPicker({
  value,
  onChange,
  hasEmailConfig = false,
  disabled,
  className,
  placeholder = "选择通知方式",
}: NotificationOptionPickerProps) {
  const options = [NONE_OPTION, ...(hasEmailConfig ? EMAIL_OPTIONS : [])];
  const selected = options.find((o) => o.value === value);

  // 无邮件配置时，若当前选了邮件方式，自动重置为「无」
  useEffect(() => {
    if (!hasEmailConfig && value !== "none") {
      onChange("none");
    }
  }, [hasEmailConfig, value, onChange]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs",
            "ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <selected.icon className={cn("h-4 w-4", selected.isNone ? "text-destructive" : "text-muted-foreground")} />
              {selected.label}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <div className="space-y-0.5">
          {options.map((opt) => {
            const Icon = opt.icon;
            const isNone = "isNone" in opt && opt.isNone;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent",
                  value === opt.value && "bg-accent"
                )}
              >
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  isNone ? "bg-destructive/10" : "bg-muted"
                )}>
                  <Icon className={cn("h-4 w-4", isNone ? "text-destructive" : "text-muted-foreground")} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{opt.label}</p>
                  {"desc" in opt && opt.desc && (
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  )}
                </div>
              </button>
            );
          })}
          {!hasEmailConfig && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              请先在配置中心配置邮件服务
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 将 NotificationOption 转为 email_content_type */
export function toEmailContentType(opt: NotificationOption): "html" | "plain" | "file" | null {
  if (opt === "none") return null;
  if (opt === "email:html") return "html";
  if (opt === "email:file") return "file";
  if (opt === "email:plain") return "plain";
  return null;
}

/** 从 notification_config 解析为 NotificationOption（兼容 content_type / email_content_type） */
export function fromNotificationConfig(
  config?: { type?: string; email_content_type?: string; content_type?: string } | null
): NotificationOption {
  if (!config || typeof config !== "object") return "none";
  if (config.type !== "email") return "none";
  const ct = config.email_content_type ?? config.content_type;
  if (ct === "file") return "email:file";
  if (ct === "plain") return "email:plain";
  if (ct === "html") return "email:html";
  return "email:html";
}
