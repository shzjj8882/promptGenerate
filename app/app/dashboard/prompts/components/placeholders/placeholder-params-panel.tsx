"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiFieldLabel } from "@/components/shared/api-field-label";
import { PlaceholderInputField } from "./placeholder-input-field";
import { PlaceholderTableField } from "./placeholder-table-field";
import type { ParsedPlaceholderWithConfig, PlaceholderPanelVariant } from "./types";
import type { AvailableColumn } from "./types";

interface PlaceholderParamsPanelProps {
  variant: PlaceholderPanelVariant;
  needsTenant?: boolean;
  tenantValue: string;
  onTenantChange: (value: string) => void;
  inputPlaceholders: ParsedPlaceholderWithConfig[];
  tablePlaceholders: ParsedPlaceholderWithConfig[];
  params: Record<string, unknown>;
  onParamsChange: (params: Record<string, unknown>) => void;
  tableInfoMap: Record<string, import("@/lib/api/multi-dimension-tables").MultiDimensionTable>;
  loadingTables: Record<string, boolean>;
  openFilterPopover: string | null;
  onOpenFilterPopoverChange: (key: string | null) => void;
  disabled?: boolean;
  idPrefix?: string;
  /** 空状态：无占位符时的提示 */
  emptyMessage?: string;
  /** 空状态：有占位符但无 input/table 时的提示 */
  noInputMessage?: string;
  /** 作为 grid 子项渲染（无外层 space-y 容器） */
  asGridItems?: boolean;
}

const ROW_ID_COLUMN: AvailableColumn = {
  key: "row_id",
  label: "行ID (row_id)",
  type: "number",
};

/**
 * 占位符参数面板
 * 业务组件：组合租户、输入型、表格型占位符字段
 */
export function PlaceholderParamsPanel({
  variant,
  needsTenant = false,
  tenantValue,
  onTenantChange,
  inputPlaceholders,
  tablePlaceholders,
  params,
  onParamsChange,
  tableInfoMap,
  loadingTables,
  openFilterPopover,
  onOpenFilterPopoverChange,
  disabled,
  idPrefix = "placeholder",
  emptyMessage = "该提示词没有占位符",
  noInputMessage = "未检测到需要输入的占位符",
  asGridItems = false,
}: PlaceholderParamsPanelProps) {
  const parsedPlaceholders = [...inputPlaceholders, ...tablePlaceholders];

  const getInputValue = (paramKey: string): string => {
    const val = params[paramKey];
    if (val != null && typeof val === "object" && !Array.isArray(val) && "value" in val) {
      return String((val as { value?: string }).value ?? "");
    }
    return "";
  };

  const setInputValue = (paramKey: string, value: string) => {
    onParamsChange({
      ...params,
      [paramKey]: {
        ...(params[paramKey] && typeof params[paramKey] === "object" ? (params[paramKey] as object) : {}),
        value,
      },
    });
  };

  const getTableParams = (paramKey: string): Record<string, string> => {
    const val = params[paramKey];
    if (val != null && typeof val === "object" && !Array.isArray(val)) {
      return val as Record<string, string>;
    }
    return {};
  };

  const setTableParams = (paramKey: string, newParams: Record<string, string>) => {
    onParamsChange({ ...params, [paramKey]: newParams });
  };

  const tenantField = needsTenant && (
    <div className="space-y-2">
      {variant === "api" ? (
        <ApiFieldLabel keyName="tenantCode" typeBadge="string" nested badgeVariant="outline" htmlFor={`${idPrefix}-tenant`} />
      ) : variant === "chat" ? (
        <ApiFieldLabel keyName="tenantCode" help="租户编号，多租户场景必填。" typeBadge="string" nested badgeVariant="outline" required htmlFor={`${idPrefix}-tenant`} />
      ) : (
        <Label htmlFor={`${idPrefix}-tenant`}>
          租户编号 <span className="text-destructive">*</span>
        </Label>
      )}
      <Input
        id={`${idPrefix}-tenant`}
        value={tenantValue}
        onChange={(e) => onTenantChange(e.target.value)}
        placeholder="输入租户编号"
        required={needsTenant}
        disabled={disabled}
        className={variant === "api" ? "h-9 text-sm font-mono" : "text-sm"}
      />
    </div>
  );

  const content = (
    <>
      {tenantField}
      {inputPlaceholders.map((parsed) => {
        const paramKey = parsed.placeholder?.key || parsed.key;
        return (
          <PlaceholderInputField
            key={parsed.originalText}
            parsed={parsed}
            value={getInputValue(paramKey)}
            onChange={(v) => setInputValue(paramKey, v)}
            variant={variant}
            disabled={disabled}
            idPrefix={idPrefix}
          />
        );
      })}
      {tablePlaceholders.map((parsed) => {
        const placeholder = parsed.placeholder;
        const paramKey = placeholder?.key || parsed.key;
        const tableId = placeholder?.table_id;
        const table = tableId ? tableInfoMap[tableId] : null;
        const isLoadingTable = tableId ? loadingTables[tableId] : false;
        const tableColumns = (table?.columns || []).filter((c) => c.key !== placeholder?.table_column_key);
        const availableColumns: AvailableColumn[] = [ROW_ID_COLUMN, ...tableColumns];

        const currentParams = getTableParams(paramKey);
        const currentConditionKey =
          Object.keys(currentParams).find((k) => currentParams[k] !== undefined && currentParams[k] !== "") ||
          Object.keys(currentParams)[0] ||
          "";
        const currentValue = currentConditionKey ? currentParams[currentConditionKey] || "" : "";

        return (
          <PlaceholderTableField
            key={parsed.originalText}
            parsed={parsed}
            availableColumns={availableColumns}
            isLoadingTable={isLoadingTable}
            currentConditionKey={currentConditionKey}
            currentValue={currentValue}
            onConditionChange={(k) => {
              const nextParams = k ? { [k]: currentParams[k] ?? "" } : {};
              setTableParams(paramKey, nextParams);
            }}
            onValueChange={(v) => setTableParams(paramKey, { ...currentParams, [currentConditionKey]: v })}
            onClear={variant === "chat" ? () => setTableParams(paramKey, {}) : undefined}
            variant={variant}
            disabled={disabled}
            open={openFilterPopover === paramKey}
            onOpenChange={(o) => onOpenFilterPopoverChange(o ? paramKey : null)}
            idPrefix={idPrefix}
          />
        );
      })}
      {parsedPlaceholders.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">{emptyMessage}</p>
      )}
      {parsedPlaceholders.length > 0 && inputPlaceholders.length === 0 && tablePlaceholders.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">{noInputMessage}</p>
      )}
    </>
  );

  if (asGridItems) {
    return <>{content}</>;
  }
  return <div className="space-y-3">{content}</div>;
}
