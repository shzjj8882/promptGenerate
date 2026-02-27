"use client";

import { Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiFieldLabel } from "@/components/shared/api-field-label";
import { cn } from "@/lib/utils";
import type { ParsedPlaceholderWithConfig } from "./types";
import type { PlaceholderPanelVariant, AvailableColumn } from "./types";

interface PlaceholderTableFieldProps {
  parsed: ParsedPlaceholderWithConfig;
  availableColumns: AvailableColumn[];
  isLoadingTable: boolean;
  currentConditionKey: string;
  currentValue: string;
  onConditionChange: (key: string) => void;
  onValueChange: (value: string) => void;
  onClear?: () => void;
  variant: PlaceholderPanelVariant;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idPrefix?: string;
}

/**
 * 多维表格类型占位符字段
 * 纯 UI 组件：Popover + 条件列选择 + 条件值输入
 */
export function PlaceholderTableField({
  parsed,
  availableColumns,
  isLoadingTable,
  currentConditionKey,
  currentValue,
  onConditionChange,
  onValueChange,
  onClear,
  variant,
  disabled,
  open,
  onOpenChange,
  idPrefix = "placeholder",
}: PlaceholderTableFieldProps) {
  const placeholder = parsed.placeholder;
  const paramKey = placeholder?.key || parsed.key;
  const label = placeholder?.label || parsed.key;

  const displayText = currentConditionKey
    ? currentValue
      ? `${availableColumns.find((c) => c.key === currentConditionKey)?.label || currentConditionKey}: ${currentValue}`
      : `${availableColumns.find((c) => c.key === currentConditionKey)?.label || currentConditionKey}: (未输入)`
    : "点击设置筛选条件";

  const triggerDisabled = isLoadingTable || availableColumns.length === 0 || disabled;

  const popoverContent = (
    <PopoverContent className={variant === "chat" ? "w-80 p-4" : "w-72 p-4"} align="start">
      <div className={variant === "chat" ? "space-y-4" : "space-y-3"}>
        {variant === "chat" && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">筛选条件</Label>
            <p className="text-xs text-muted-foreground">选择条件字段和对应的值</p>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-condition-${paramKey}`} className="text-xs">
            {variant === "chat" ? "条件字段" : "条件字段"}
          </Label>
          <Select
            value={currentConditionKey}
            onValueChange={onConditionChange}
            disabled={triggerDisabled}
          >
            <SelectTrigger
              id={`${idPrefix}-condition-${paramKey}`}
              className={variant === "chat" ? "h-8 text-sm w-full" : "h-8 text-sm w-full"}
            >
              <SelectValue
                placeholder={
                  isLoadingTable ? "加载中..." : availableColumns.length === 0 ? "无可用列" : "选择列"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {availableColumns.map((col) => (
                <SelectItem key={col.key} value={col.key}>
                  {col.label || col.key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {currentConditionKey && (
          <>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-value-${paramKey}`} className="text-xs">
                条件值
              </Label>
              <Input
                id={`${idPrefix}-value-${paramKey}`}
                type={currentConditionKey === "row_id" ? "number" : "text"}
                value={currentValue}
                onChange={(e) => onValueChange(e.target.value)}
                placeholder={
                  variant === "chat"
                    ? `输入 ${availableColumns.find((c) => c.key === currentConditionKey)?.label || currentConditionKey} 的值`
                    : "输入值"
                }
                className="h-8 text-sm"
                disabled={disabled}
              />
            </div>
            {onClear && variant === "chat" && (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onClear();
                    onOpenChange(false);
                  }}
                  className="h-7 text-xs"
                  disabled={disabled}
                >
                  清除
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PopoverContent>
  );

  const renderLabel = () => {
    if (variant === "api" || variant === "chat") {
      return (
        <ApiFieldLabel
          keyName={paramKey}
          help={
            placeholder?.label
              ? `${placeholder.label}（${paramKey}）表格行筛选条件`
              : `占位符 ${paramKey}，表格行筛选条件`
          }
          typeBadge="object"
          nested
          badgeVariant="outline"
        />
      );
    }
    return (
      <Label className="text-xs">{label}</Label>
    );
  };

  return (
    <div className="space-y-2">
      {renderLabel()}
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal gap-2",
              variant === "api" ? "h-9 text-sm" : "h-8 text-sm"
            )}
            disabled={triggerDisabled}
          >
            <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className={cn("truncate flex-1", !currentConditionKey && "text-muted-foreground")}>
              {isLoadingTable ? "加载中..." : availableColumns.length === 0 ? "无可用列" : displayText}
            </span>
          </Button>
        </PopoverTrigger>
        {popoverContent}
      </Popover>
      {placeholder?.description && variant === "chat" && (
        <p className="text-xs text-muted-foreground">{placeholder.description}</p>
      )}
    </div>
  );
}
