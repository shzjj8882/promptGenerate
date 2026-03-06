"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Upload } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { TableColumn as TableColumnType } from "@/lib/api/multi-dimension-tables";

export type ImportColumnMapping = {
  excelHeader: string;
  key: string;
  label: string;
  type: string;
  defaultValue: string;
};

export interface TableCanvasImportDialogsProps {
  importDialogOpen: boolean;
  setImportDialogOpen: (v: boolean) => void;
  columnMappingDialogOpen: boolean;
  setColumnMappingDialogOpen: (v: boolean) => void;
  importModeDialogOpen: boolean;
  setImportModeDialogOpen: (v: boolean) => void;
  columnMismatchDialogOpen: boolean;
  setColumnMismatchDialogOpen: (v: boolean) => void;
  errorDialogOpen: boolean;
  setErrorDialogOpen: (v: boolean) => void;
  successDialogOpen: boolean;
  setSuccessDialogOpen: (v: boolean) => void;
  errorMessage: string;
  successMessage: string;
  importMode: "append" | "replace";
  setImportMode: (v: "append" | "replace") => void;
  excelHeaders: string[];
  setExcelHeaders: (v: string[]) => void;
  excelData: unknown[][];
  setExcelData: (v: unknown[][]) => void;
  columnMappings: ImportColumnMapping[];
  setColumnMappings: (v: ImportColumnMapping[] | ((prev: ImportColumnMapping[]) => ImportColumnMapping[])) => void;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  setErrorMessage: (v: string) => void;
  setSuccessMessage: (v: string) => void;
  tableColumns: TableColumnType[] | undefined;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileImport: (file: File) => Promise<void>;
  onExecuteImport: (mappings: ImportColumnMapping[], mode: "append" | "replace") => void;
  /** 列一致时在「选择导入模式」弹窗中点击确认：父组件根据 excelHeaders/importMode 生成 mappings 并执行导入 */
  onConfirmImportMode: () => void;
  /** 列不一致时用户点击「确认替换」：父组件负责生成 mappings 并更新 state、打开列映射弹窗 */
  onConfirmColumnMismatchReplace: (excelHeaders: string[]) => void;
}

export function TableCanvasImportDialogs({
  importDialogOpen,
  setImportDialogOpen,
  columnMappingDialogOpen,
  setColumnMappingDialogOpen,
  importModeDialogOpen,
  setImportModeDialogOpen,
  columnMismatchDialogOpen,
  setColumnMismatchDialogOpen,
  errorDialogOpen,
  setErrorDialogOpen,
  successDialogOpen,
  setSuccessDialogOpen,
  errorMessage,
  successMessage,
  importMode,
  setImportMode,
  excelHeaders,
  setExcelHeaders,
  excelData,
  setExcelData,
  columnMappings,
  setColumnMappings,
  isDragging,
  setIsDragging,
  setErrorMessage,
  setSuccessMessage,
  tableColumns,
  fileInputRef,
  onFileImport,
  onExecuteImport,
  onConfirmImportMode,
  onConfirmColumnMismatchReplace,
}: TableCanvasImportDialogsProps) {
  return (
    <>
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85dvh] sm:max-h-[90vh] mx-auto">
          <DialogHeader>
            <DialogTitle>导入文件（Excel / CSV）</DialogTitle>
            <DialogDescription>
              <div className="space-y-3 mt-2">
                <p className="font-medium mb-1">导入规则：</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>第一行将作为列标题</li>
                  <li>支持的格式：.xlsx, .xls, .csv</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
              const files = e.dataTransfer.files;
              if (files.length > 0) {
                const file = files[0];
                if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv")) {
                  await onFileImport(file);
                } else {
                  setErrorMessage("请选择 .xlsx、.xls 或 .csv 格式的文件");
                  setErrorDialogOpen(true);
                }
              }
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-2">{isDragging ? "松开鼠标以导入文件" : "点击或拖拽文件到这里"}</p>
            <p className="text-sm text-muted-foreground">支持 .xlsx、.xls、.csv 格式</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await onFileImport(f);
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={columnMappingDialogOpen} onOpenChange={setColumnMappingDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[85dvh] sm:max-h-[80vh] flex flex-col overflow-hidden p-0 gap-0 mx-auto">
          <DialogHeader className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 pr-12 border-b">
            <DialogTitle>定义列信息</DialogTitle>
            <DialogDescription>
              {importMode === "replace"
                ? "请为 Excel 中的每一列定义列 Key、数据类型和默认值。导入将替换所有现有数据，此操作不可恢复。"
                : "请为 Excel 中的每一列定义列 Key、数据类型和默认值。"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="space-y-2">
              {columnMappings.map((mapping, index) => (
                <div key={index} className="p-3 border rounded-lg space-y-3">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground mb-1 block">Excel 列名</Label>
                      <div className="text-sm font-medium">{mapping.excelHeader}</div>
                    </div>
                    <div className="flex-1">
                      <Label htmlFor={`key-${index}`} className="text-xs text-muted-foreground mb-1 block">
                        列 Key *
                      </Label>
                      <Input
                        id={`key-${index}`}
                        value={mapping.key}
                        onChange={(e) => {
                          const v = [...columnMappings];
                          v[index] = { ...v[index], key: e.target.value.trim() };
                          setColumnMappings(v);
                        }}
                        placeholder="例如: user_name"
                        className="text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <Label htmlFor={`type-${index}`} className="text-xs text-muted-foreground mb-1 block">
                        数据类型 *
                      </Label>
                      <Select
                        value={mapping.type}
                        onValueChange={(value) => {
                          const v = [...columnMappings];
                          v[index] = { ...v[index], type: value };
                          setColumnMappings(v);
                        }}
                      >
                        <SelectTrigger id={`type-${index}`} className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">文本</SelectItem>
                          <SelectItem value="number">数字</SelectItem>
                          <SelectItem value="date">日期</SelectItem>
                          <SelectItem value="single_select">单选</SelectItem>
                          <SelectItem value="multi_select">多选</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Label htmlFor={`defaultValue-${index}`} className="text-xs text-muted-foreground mb-1 block">
                        默认值
                      </Label>
                      <Input
                        id={`defaultValue-${index}`}
                        type={mapping.type === "number" ? "number" : "text"}
                        value={mapping.defaultValue}
                        onChange={(e) => {
                          const v = [...columnMappings];
                          v[index] = { ...v[index], defaultValue: e.target.value };
                          setColumnMappings(v);
                        }}
                        placeholder="可选"
                        className="text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t flex flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setColumnMappingDialogOpen(false);
                setColumnMappings([]);
                setExcelHeaders([]);
                setExcelData([]);
              }}
            >
              取消
            </Button>
            <Button
              onClick={() => {
                if (!columnMappings.every((m) => m.key.trim() && m.type)) {
                  setErrorMessage("请填写所有列的 Key 和数据类型");
                  setErrorDialogOpen(true);
                  return;
                }
                const keys = columnMappings.map((m) => m.key.trim());
                if (keys.length !== new Set(keys).size) {
                  setErrorMessage("列 Key 不能重复");
                  setErrorDialogOpen(true);
                  return;
                }
                onExecuteImport(columnMappings, importMode);
              }}
            >
              确认导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importModeDialogOpen} onOpenChange={setImportModeDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg mx-auto">
          <DialogHeader>
            <DialogTitle>选择导入模式</DialogTitle>
            <DialogDescription>Excel 文件的列与当前表格的列一致，请选择导入方式：</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="append"
                name="importMode"
                value="append"
                checked={importMode === "append"}
                onChange={(e) => setImportMode(e.target.value as "append" | "replace")}
                className="w-4 h-4"
              />
              <Label htmlFor="append" className="cursor-pointer">
                <div className="font-medium">追加数据</div>
                <div className="text-sm text-muted-foreground">将 Excel 数据追加到现有数据之后</div>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="replace"
                name="importMode"
                value="replace"
                checked={importMode === "replace"}
                onChange={(e) => setImportMode(e.target.value as "append" | "replace")}
                className="w-4 h-4"
              />
              <Label htmlFor="replace" className="cursor-pointer">
                <div className="font-medium">替换数据</div>
                <div className="text-sm text-muted-foreground">用 Excel 数据替换所有现有数据（此操作不可恢复）</div>
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setImportModeDialogOpen(false);
                setExcelHeaders([]);
                setExcelData([]);
              }}
            >
              取消
            </Button>
            <Button onClick={onConfirmImportMode}>确认导入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={columnMismatchDialogOpen} onOpenChange={setColumnMismatchDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85dvh] mx-auto overflow-y-auto">
          <DialogHeader>
            <DialogTitle>列不一致</DialogTitle>
            <DialogDescription>
              <div className="space-y-2 mt-2">
                <p>Excel 文件的列与当前表格的列不一致。</p>
                <div className="text-sm">
                  <p className="font-medium mb-1">Excel 列：</p>
                  <p className="text-muted-foreground">{excelHeaders.join(", ")}</p>
                </div>
                <div className="text-sm">
                  <p className="font-medium mb-1">表格列：</p>
                  <p className="text-muted-foreground">{tableColumns?.map((c) => c.label).join(", ") ?? ""}</p>
                </div>
                <p className="text-destructive font-medium mt-2">导入将替换所有现有数据，此操作不可恢复。</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setColumnMismatchDialogOpen(false);
                setExcelHeaders([]);
                setExcelData([]);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => onConfirmColumnMismatchReplace(excelHeaders)}
            >
              确认替换
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg mx-auto">
          <DialogHeader>
            <DialogTitle>错误</DialogTitle>
            <DialogDescription>{errorMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorDialogOpen(false)}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg mx-auto">
          <DialogHeader>
            <DialogTitle>导入成功</DialogTitle>
            <DialogDescription className="whitespace-pre-line">{successMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setSuccessDialogOpen(false)}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
