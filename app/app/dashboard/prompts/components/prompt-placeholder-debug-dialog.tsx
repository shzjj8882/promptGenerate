"use client";

import { useState, useCallback } from "react";
import { FileText, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  parsePlaceholdersFromText,
  parsePlaceholderDetails,
  checkIfTenantRequired,
  getSceneLabel,
} from "../utils/prompt-utils";
import type { Prompt, Placeholder } from "../prompts-client";
import { convertPrompt } from "@/lib/api/llmchat";
import { logger } from "@/lib/utils/logger";
import { PlaceholderParamsPanel } from "./placeholders";
import { usePlaceholderTables } from "../hooks/use-placeholder-tables";
import { FieldHelp } from "@/components/ui/field-help";
import { Badge } from "@/components/ui/badge";

interface PromptPlaceholderDebugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: Prompt | null;
  tenants: Array<{ id: string; code_id: string; name: string }>;
  placeholders: Placeholder[];
}

/**
 * 提示词占位符调试对话框
 * 仅做占位符转换，不调用 LLM
 */
export function PromptPlaceholderDebugDialog({
  open,
  onOpenChange,
  prompt,
  tenants,
  placeholders,
}: PromptPlaceholderDebugDialogProps) {
  const [debugTenantCode, setDebugTenantCode] = useState("");
  const [debugPlaceholderParams, setDebugPlaceholderParams] = useState<Record<string, unknown>>({});
  const [openFilterPopover, setOpenFilterPopover] = useState<string | null>(null);
  const [convertedContent, setConvertedContent] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const { tableInfoMap, loadingTables } = usePlaceholderTables(placeholders, !!open && !!prompt);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setConvertedContent(null);
        setConvertError(null);
      }
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const needsTenant = prompt ? checkIfTenantRequired(prompt.content, prompt.placeholders) : false;
  const contentPlaceholders = prompt ? parsePlaceholdersFromText(prompt.content) : [];

  const parsedPlaceholders = contentPlaceholders
    .map((ph) => {
      const details = parsePlaceholderDetails(`{${ph}}`);
      if (details) {
        const placeholderByKey = placeholders.find((p) => p.key === details.key);
        const placeholderByLabel = placeholders.find((p) => p.label === details.key);
        const placeholder = placeholderByKey || placeholderByLabel;
        let actualType = details.type;
        if (placeholder) {
          const dataSourceType = (placeholder as Placeholder & { data_source_type?: string }).data_source_type || "user_input";
          actualType = dataSourceType === "multi_dimension_table" ? "table" : "input";
        }
        return { ...details, type: actualType, placeholder };
      }
      return null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const inputPlaceholders = parsedPlaceholders.filter((p) => p.type === "input");
  const tablePlaceholders = parsedPlaceholders.filter((p) => p.type === "table");

  // 构建 additional_params（与后端期望格式一致）
  // input 类型：{key: value} 直接传值
  // table 类型：{key: {condition_field: value}} 传嵌套对象
  const buildAdditionalParams = useCallback((): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(debugPlaceholderParams)) {
      if (val == null) continue;
      if (typeof val === "object" && !Array.isArray(val) && val !== null) {
        const obj = val as Record<string, unknown>;
        if ("value" in obj && obj.value !== undefined && String(obj.value).trim() !== "") {
          result[key] = obj.value;
        } else if (Object.keys(obj).length > 0) {
          result[key] = obj;
        }
      } else if (String(val).trim() !== "") {
        result[key] = val;
      }
    }
    return result;
  }, [debugPlaceholderParams]);

  const handleConvert = useCallback(async () => {
    if (!prompt || converting) return;
    if (needsTenant && !debugTenantCode.trim()) {
      setConvertError("该提示词需要租户编号");
      return;
    }

    setConverting(true);
    setConvertError(null);
    try {
      const params = buildAdditionalParams();
      const result = await convertPrompt(prompt.scene, {
        tenantCode: debugTenantCode.trim() || undefined,
        additional_params: Object.keys(params).length > 0 ? params : undefined,
      });
      setConvertedContent(result.content);
    } catch (err) {
      logger.error("占位符转换失败", err);
      setConvertError(err instanceof Error ? err.message : "转换失败");
    } finally {
      setConverting(false);
    }
  }, [prompt, converting, needsTenant, debugTenantCode, buildAdditionalParams]);

  if (!prompt) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-lg">占位符调试 - {getSceneLabel(prompt.scene)}</DialogTitle>
          <DialogDescription className="text-sm">
            仅做占位符转换，不调用 LLM。输入参数后查看替换后的提示词内容。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col sm:flex-row gap-4 overflow-hidden px-6 pb-6 min-h-0">
          {/* 左侧：additional_params 风格 */}
          <div className="w-full sm:w-80 shrink-0 overflow-y-auto border rounded-lg p-4 space-y-4 bg-card shadow-sm">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-primary rounded-full" />
              <h3 className="font-semibold text-sm font-mono">additional_params</h3>
              <FieldHelp content="占位符参数。根据提示词中的占位符动态生成，用于替换提示词中的变量。" />
              <Badge variant="secondary" className="text-xs">object</Badge>
            </div>
            <div className="pl-4 border-l-2 border-muted-foreground/30 space-y-3">
            <PlaceholderParamsPanel
              variant="chat"
              needsTenant={needsTenant}
              tenantValue={debugTenantCode}
              onTenantChange={setDebugTenantCode}
              inputPlaceholders={inputPlaceholders}
              tablePlaceholders={tablePlaceholders}
              params={debugPlaceholderParams}
              onParamsChange={setDebugPlaceholderParams}
              tableInfoMap={tableInfoMap}
              loadingTables={loadingTables}
              openFilterPopover={openFilterPopover}
              onOpenFilterPopoverChange={setOpenFilterPopover}
              idPrefix="ph-debug"
            />
            </div>
            <Button className="w-full" onClick={handleConvert} disabled={converting}>
              {converting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  转换中...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  转换
                </>
              )}
            </Button>
          </div>

          {/* 右侧：转换结果 */}
          <div className="flex-1 flex flex-col min-h-0 border rounded-lg overflow-hidden bg-muted/30">
            <div className="px-4 py-2 border-b bg-muted/50 shrink-0">
              <h3 className="font-semibold text-sm">转换结果</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {convertError && (
                <div className="text-sm text-destructive mb-2">{convertError}</div>
              )}
              {convertedContent !== null ? (
                <pre className="text-sm whitespace-pre-wrap font-mono bg-background p-4 rounded border">
                  {convertedContent || "(空)"}
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground text-sm">
                  <FileText className="h-12 w-12 mb-2 opacity-50" />
                  <p>输入占位符参数后点击「转换」查看结果</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
