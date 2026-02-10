"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { observer } from "mobx-react-lite";
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Settings2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MemoizedTableRow } from "@/components/shared/memoized-table-row";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SortIcon } from "@/components/shared/sort-icon";
import { TableState } from "@/components/shared/table-state";
import { ActionButtons } from "@/components/shared/action-buttons";
import { TableSkeleton } from "@/components/shared/table-skeleton";
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getPlaceholders,
  createPlaceholder,
  updatePlaceholder,
  deletePlaceholder,
  type Placeholder,
  type PlaceholderCreate,
} from "@/lib/api/prompts";
import { getTables, type MultiDimensionTable } from "@/lib/api/multi-dimension-tables";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { Badge } from "@/components/ui/badge";

const DATA_SOURCE_TYPES = [
  { value: "user_input", label: "用户输入" },
  { value: "multi_dimension_table", label: "多维表格" },
] as const;

const DATA_TYPES = [
  { value: "string", label: "字符串" },
  { value: "number", label: "数字" },
  { value: "boolean", label: "布尔值" },
  { value: "date", label: "日期" },
] as const;

type PlaceholdersConfigClientProps = {
  initialPlaceholders?: Placeholder[];
  initialTotal?: number;
  initialPage?: number;
};

function PlaceholdersConfigClientImpl({
  initialPlaceholders,
  initialTotal,
  initialPage = 1,
}: PlaceholdersConfigClientProps = {}) {
  const [placeholders, setPlaceholders] = useState<Placeholder[]>(initialPlaceholders || []);
  const [tables, setTables] = useState<MultiDimensionTable[]>([]);
  const [loading, setLoading] = useState(!initialPlaceholders);
  
  // 删除确认对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [placeholderToDelete, setPlaceholderToDelete] = useState<Placeholder | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // 分页状态
  const {
    currentPage,
    setCurrentPage,
    totalCount,
    setTotalCount,
    totalPages,
  } = usePagination({
    initialPage,
    initialTotal: initialTotal ?? 0,
  });
  
  // 占位符对话框状态
  const [isPlaceholderDialogOpen, setIsPlaceholderDialogOpen] = useState(false);
  const [editingPlaceholder, setEditingPlaceholder] = useState<Placeholder | null>(null);
  const [placeholderKey, setPlaceholderKey] = useState("");
  const [placeholderLabel, setPlaceholderLabel] = useState("");
  const [placeholderDescription, setPlaceholderDescription] = useState("");
  const [dataSourceType, setDataSourceType] = useState<"user_input" | "multi_dimension_table">("user_input");
  const [dataType, setDataType] = useState<string>("string");
  const [selectedTableId, setSelectedTableId] = useState<string>("");
  const [selectedColumnKey, setSelectedColumnKey] = useState<string>("");
  const [savingPlaceholder, setSavingPlaceholder] = useState(false);

  const { handleError } = useErrorHandler({
    showToast: true,
  });

  const fetchPlaceholders = useCallback(async (page: number = currentPage) => {
    try {
      setLoading(true);
      const skip = (page - 1) * DEFAULT_PAGE_SIZE;
      const response = await getPlaceholders({
        skip,
        limit: DEFAULT_PAGE_SIZE,
      });
      setPlaceholders(response.items);
      setTotalCount(response.total);
    } catch (error) {
      handleError(error, "加载占位符列表失败");
    } finally {
      setLoading(false);
    }
  }, [handleError, currentPage, setTotalCount]);

  const fetchTables = useCallback(async () => {
    try {
      const response = await getTables();
      setTables(response.items || []);
    } catch (error) {
      handleError(error, "加载表格列表失败");
    }
  }, [handleError]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  // 分页加载占位符
  useEffect(() => {
    if (initialPlaceholders && initialPlaceholders.length > 0 && currentPage === initialPage) {
      return;
    }
    fetchPlaceholders(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, initialPlaceholders, initialPage]);

  const handleCreatePlaceholder = () => {
    setEditingPlaceholder(null);
    setPlaceholderKey("");
    setPlaceholderLabel("");
    setPlaceholderDescription("");
    setDataSourceType("user_input");
    setDataType("string");
    setSelectedTableId("");
    setSelectedColumnKey("");
    setIsPlaceholderDialogOpen(true);
  };

  const handleEditPlaceholder = (placeholder: Placeholder) => {
    setEditingPlaceholder(placeholder);
    setPlaceholderKey(placeholder.key);
    setPlaceholderLabel(placeholder.label);
    setPlaceholderDescription(placeholder.description || "");
    
    // 解析数据源类型（从 method_params 或其他字段推断，这里简化处理）
    // 实际应该从数据库字段 data_source_type 读取
    const sourceType = (placeholder as any).data_source_type || "user_input";
    setDataSourceType(sourceType as "user_input" | "multi_dimension_table");
    setDataType((placeholder as any).data_type || "string");
    
    // 如果是多维表格类型，解析相关字段
    if (sourceType === "multi_dimension_table") {
      setSelectedTableId((placeholder as any).table_id || "");
      setSelectedColumnKey((placeholder as any).table_column_key || "");
      // table_row_id_param_key 由接口调用时自动获取，不需要用户填写
    } else {
      setSelectedTableId("");
      setSelectedColumnKey("");
    }
    
    setIsPlaceholderDialogOpen(true);
  };

  const handleSavePlaceholder = async () => {
    if (!placeholderKey.trim() || !placeholderLabel.trim()) {
      handleError(new Error("请填写完整信息"), "请填写占位符 key 和 label");
      return;
    }

    if (dataSourceType === "multi_dimension_table") {
      if (!selectedTableId || !selectedColumnKey) {
        handleError(new Error("多维表格配置不完整"), "请选择表格和列");
        return;
      }
    }

    try {
      setSavingPlaceholder(true);
      const placeholderData: PlaceholderCreate & {
        data_source_type?: string;
        data_type?: string;
        table_id?: string;
        table_column_key?: string;
        table_row_id_param_key?: string;
      } = {
        key: placeholderKey.trim(),
        label: placeholderLabel.trim(),
        description: placeholderDescription.trim() || undefined,
        scene: "", // 占位符是全局的，不关联特定场景，scene 为空字符串
        data_source_type: dataSourceType,
        data_type: dataType,
      };

      if (dataSourceType === "multi_dimension_table") {
        placeholderData.table_id = selectedTableId;
        placeholderData.table_column_key = selectedColumnKey;
        // table_row_id_param_key 由接口调用时自动获取，不需要用户填写
      }

      if (editingPlaceholder) {
        await updatePlaceholder(editingPlaceholder.id, placeholderData);
      } else {
        await createPlaceholder(placeholderData);
      }
      
      setIsPlaceholderDialogOpen(false);
      await fetchPlaceholders(currentPage);
    } catch (error) {
      handleError(error, editingPlaceholder ? "更新占位符失败" : "创建占位符失败");
    } finally {
      setSavingPlaceholder(false);
    }
  };

  const handleDeletePlaceholder = (placeholder: Placeholder) => {
    setPlaceholderToDelete(placeholder);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!placeholderToDelete) return;
    
    try {
      setDeleteLoading(true);
      await deletePlaceholder(placeholderToDelete.id);
      setDeleteDialogOpen(false);
      setPlaceholderToDelete(null);
      
      // 如果当前页没有数据了，且不是第一页，则跳转到上一页
      if (placeholders.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      } else {
        await fetchPlaceholders(currentPage);
      }
    } catch (error) {
      handleError(error, "删除占位符失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  const selectedTable = tables.find(t => t.id === selectedTableId);

  // Data Table 状态（参考租户列表）
  const [sorting, setSorting] = useState<SortingState>([{ id: "key", desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ search: false });

  const columnsToggleable = useMemo(
    () => [
      { id: "key", label: "Key" },
      { id: "label", label: "Label" },
      { id: "data_source_type", label: "数据源类型" },
      { id: "data_type", label: "数据类型" },
      { id: "description", label: "描述" },
    ],
    []
  );

  const renderSortIcon = useCallback((sorted: false | "asc" | "desc") => {
    return <SortIcon sorted={sorted} />;
  }, []);

  const columns = useMemo<ColumnDef<Placeholder>[]>(
    () => [
      // 用于全局搜索，隐藏不展示
      {
        id: "search",
        accessorFn: (row) => `${row.key} ${row.label} ${row.description || ""}`,
        enableSorting: false,
        enableHiding: false,
        filterFn: "includesString",
        header: () => null,
        cell: () => null,
      },
      {
        accessorKey: "key",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Key
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="font-mono text-sm">{row.original.key}</div>
        ),
      },
      {
        accessorKey: "label",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Label
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => <div className="font-medium">{row.original.label}</div>,
      },
      {
        id: "data_source_type",
        accessorFn: (row) => (row as any).data_source_type || "user_input",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            数据源类型
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => {
          const sourceType = (row.original as any).data_source_type || "user_input";
          return (
            <Badge variant={sourceType === "user_input" ? "default" : "secondary"}>
              {sourceType === "user_input" ? "用户输入" : "多维表格"}
            </Badge>
          );
        },
      },
      {
        id: "data_type",
        accessorFn: (row) => (row as any).data_type || "string",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            数据类型
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-sm">{(row.original as any).data_type || "string"}</div>
        ),
      },
      {
        accessorKey: "description",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            描述
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="max-w-xs truncate text-sm text-muted-foreground">
            {row.original.description || "-"}
          </div>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">操作</div>,
        cell: ({ row }) => {
          const placeholder = row.original;
          return (
            <ActionButtons
              onEdit={() => handleEditPlaceholder(placeholder)}
              onDelete={() => handleDeletePlaceholder(placeholder)}
              canEdit={true}
              canDelete={true}
              deleteLoading={deleteLoading && placeholderToDelete?.id === placeholder.id}
              variant="dropdown"
            />
          );
        },
      },
    ],
    [renderSortIcon]
  );

  const table = useReactTable({
    data: placeholders,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title="占位符编辑设计"
        description="定义和管理占位符，支持用户输入和多维表格数据源"
        action={null}
      />

      {/* 列表 + 分页：中间可滚动，分页固定在底部 */}
      <div className="flex flex-1 min-h-0 flex-col gap-4">
        {/* 顶部工具栏（搜索等） */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <Input
              placeholder="搜索占位符（Key / Label / 描述）..."
              value={(table.getColumn("search")?.getFilterValue() as string) ?? ""}
              onChange={(event) => table.getColumn("search")?.setFilterValue(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <Settings2 className="mr-2 h-4 w-4" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px]">
                <DropdownMenuLabel>显示列</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columnsToggleable.map((c) => {
                  const col = table.getColumn(c.id);
                  if (!col) return null;
                  return (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={col.getIsVisible()}
                      onCheckedChange={(value) => col.toggleVisibility(!!value)}
                    >
                      {c.label}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="h-9" onClick={handleCreatePlaceholder}>
              <Plus className="mr-2 h-4 w-4" />
              新建占位符
            </Button>
          </div>
        </div>

        {/* 占位符列表 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="overflow-hidden rounded-md border bg-background">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="bg-muted/40">
                    {headerGroup.headers
                      .filter((h) => h.column.id !== "search")
                      .map((header) => (
                        <TableHead
                          key={header.id}
                          className={[
                            "h-12 px-4 align-middle",
                            header.column.id === "actions" ? "text-right" : "",
                          ].join(" ")}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableSkeleton rows={5} cols={6} />
                ) : (
                  <>
                    <TableState
                      loading={false}
                      empty={!table.getRowModel().rows?.length}
                      colSpan={6}
                      emptyText="暂无占位符数据"
                    />
                    {table.getRowModel().rows?.length > 0 &&
                      table.getRowModel().rows.map((row) => (
                        <MemoizedTableRow key={row.id} row={row} />
                      ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {!loading && placeholders.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            onPageChange={setCurrentPage}
            disabled={loading}
          />
        )}
      </div>

      {/* 占位符编辑对话框 */}
      <Dialog open={isPlaceholderDialogOpen} onOpenChange={setIsPlaceholderDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editingPlaceholder ? "编辑占位符" : "新建占位符"}</DialogTitle>
            <DialogDescription>
              {editingPlaceholder ? "修改占位符配置" : "创建一个新的占位符"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 py-4 custom-scrollbar">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="placeholder-key" className="text-sm">
                  Key <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="placeholder-key"
                  value={placeholderKey}
                  onChange={(e) => setPlaceholderKey(e.target.value)}
                  placeholder="例如: userName"
                  className="font-mono h-9"
                  disabled={savingPlaceholder || !!editingPlaceholder}
                />
                <p className="text-xs text-muted-foreground">
                  {editingPlaceholder ? "Key 不可修改" : "唯一标识，创建后不可修改"}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="placeholder-label" className="text-sm">
                  Label <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="placeholder-label"
                  value={placeholderLabel}
                  onChange={(e) => setPlaceholderLabel(e.target.value)}
                  placeholder="例如: 用户姓名"
                  className="h-9"
                  disabled={savingPlaceholder}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="placeholder-description" className="text-sm">描述</Label>
              <Textarea
                id="placeholder-description"
                value={placeholderDescription}
                onChange={(e) => setPlaceholderDescription(e.target.value)}
                placeholder="占位符用途说明..."
                disabled={savingPlaceholder}
                rows={2}
                className="min-h-[60px]"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="data-source-type" className="text-sm">
                  数据源类型 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={dataSourceType}
                  onValueChange={(value) => {
                    setDataSourceType(value as "user_input" | "multi_dimension_table");
                    if (value === "user_input") {
                      setSelectedTableId("");
                      setSelectedColumnKey("");
                    }
                  }}
                  disabled={savingPlaceholder}
                >
                  <SelectTrigger id="data-source-type" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_SOURCE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {dataSourceType === "user_input" && (
                <div className="space-y-1.5">
                  <Label htmlFor="data-type" className="text-sm">
                    数据类型 <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={dataType}
                    onValueChange={setDataType}
                    disabled={savingPlaceholder}
                  >
                    <SelectTrigger id="data-type" className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATA_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {dataSourceType === "multi_dimension_table" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="table-select" className="text-sm">
                      多维表格 <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={selectedTableId}
                      onValueChange={(value) => {
                        setSelectedTableId(value);
                        setSelectedColumnKey(""); // 重置列选择
                      }}
                      disabled={savingPlaceholder}
                    >
                      <SelectTrigger id="table-select" className="h-9 w-full">
                        <SelectValue placeholder="请先选择多维表格" />
                      </SelectTrigger>
                      <SelectContent>
                        {tables.length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            暂无可用表格
                          </div>
                        ) : (
                          tables.map((table) => (
                            <SelectItem key={table.id} value={table.id}>
                              {table.name}
                              {table.columns && table.columns.length > 0 && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  ({table.columns.length} 列)
                                </span>
                              )}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="column-select" className="text-sm">
                      列 <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={selectedColumnKey}
                      onValueChange={setSelectedColumnKey}
                      disabled={savingPlaceholder || !selectedTable || !selectedTable.columns || selectedTable.columns.length === 0}
                    >
                      <SelectTrigger id="column-select" className="h-9 w-full">
                        <SelectValue placeholder={selectedTable && selectedTable.columns && selectedTable.columns.length > 0 ? "从表格列中选择" : "请先选择表格"} />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedTable && selectedTable.columns && selectedTable.columns.length > 0 ? (
                          selectedTable.columns.map((col) => (
                            <SelectItem key={col.key} value={col.key}>
                              {col.label}
                            </SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            {selectedTable ? "所选表格暂无列定义" : "请先选择多维表格"}
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>

            {dataSourceType === "multi_dimension_table" && selectedTable && (!selectedTable.columns || selectedTable.columns.length === 0) && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                所选表格 "{selectedTable.name}" 暂无列定义，请先为该表格添加列
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPlaceholderDialogOpen(false)}
              disabled={savingPlaceholder}
            >
              取消
            </Button>
            <Button onClick={handleSavePlaceholder} disabled={savingPlaceholder}>
              {savingPlaceholder ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setPlaceholderToDelete(null);
          }
        }}
        title="确认删除"
        description={`确定要删除占位符 "${placeholderToDelete?.label || ""}" 吗？`}
        itemName={placeholderToDelete?.label}
        onConfirm={handleConfirmDelete}
        loading={deleteLoading}
      />
    </div>
  );
}

export const PlaceholdersConfigClient = observer(PlaceholdersConfigClientImpl);
