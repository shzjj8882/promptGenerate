"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiFieldLabel } from "@/components/shared/api-field-label";
import type { ParsedPlaceholderWithConfig, PlaceholderPanelVariant } from "./types";

interface PlaceholderInputFieldProps {
  parsed: ParsedPlaceholderWithConfig;
  value: string;
  onChange: (value: string) => void;
  variant: PlaceholderPanelVariant;
  disabled?: boolean;
  idPrefix?: string;
}

/**
 * 用户输入类型占位符字段
 * 纯 UI 组件，不包含业务逻辑
 */
export function PlaceholderInputField({
  parsed,
  value,
  onChange,
  variant,
  disabled,
  idPrefix = "placeholder",
}: PlaceholderInputFieldProps) {
  const placeholder = parsed.placeholder;
  const paramKey = placeholder?.key || parsed.key;
  const label = placeholder?.label || parsed.key;

  const inputProps = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    placeholder: variant === "api" ? paramKey : `输入 ${label}`,
    disabled,
  };

  if (variant === "api") {
    return (
      <div className="space-y-1.5">
        <ApiFieldLabel
          keyName={paramKey}
          help={placeholder?.label ? `${placeholder.label}（${paramKey}）` : `占位符参数 ${paramKey}`}
          typeBadge="string"
          nested
          badgeVariant="outline"
          htmlFor={`${idPrefix}-${paramKey}`}
        />
        <Input
          id={`${idPrefix}-${paramKey}`}
          {...inputProps}
          className="h-9 text-sm font-mono"
        />
      </div>
    );
  }

  if (variant === "chat") {
    return (
      <div className="space-y-1.5">
        <ApiFieldLabel
          keyName={paramKey}
          help={placeholder?.label ? `${placeholder.label}（${paramKey}）` : `占位符 ${paramKey}`}
          typeBadge="string"
          nested
          badgeVariant="outline"
          htmlFor={`${idPrefix}-${paramKey}`}
        />
        <Input
          id={`${idPrefix}-${paramKey}`}
          {...inputProps}
          placeholder={paramKey}
          className="text-sm font-mono"
        />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={`${idPrefix}-${paramKey}`} className="text-xs">
        {label}
      </Label>
      <Input
        id={`${idPrefix}-${paramKey}`}
        {...inputProps}
        placeholder={`输入 ${label}`}
        className="text-sm"
      />
    </div>
  );
}
