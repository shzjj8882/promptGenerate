"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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
import { Plus, Pencil, Trash2, Settings2 } from "lucide-react";
import {
  getLLMModels,
  createLLMModel,
  updateLLMModel,
  deleteLLMModel,
  type LLMModel,
  type LLMModelCreate,
  type LLMModelUpdate,
} from "@/lib/api/llm-models";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/shared/table-skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SortIcon } from "@/components/shared/sort-icon";
import { ActionButtons } from "@/components/shared/action-buttons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { userStore } from "@/store/user-store";

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "doubao", label: "豆包" },
  { value: "ollama", label: "Ollama" },
  { value: "google", label: "Google" },
  { value: "cohere", label: "Cohere" },
];

function ModelsConfigClientImpl() {
  const [models, setModels] = useState<LLMModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<LLMModel | null>(null);
  const [formData, setFormData] = useState<Partial<LLMModelCreate>>({});

  const { handleError } = useErrorHandler({
    showToast: true,
  });

  const fetchModels = async () => {
    try {
      setLoading(true);
      const response = await getLLMModels({ limit: 1000 });
      setModels(response.items);
    } catch (error) {
      handleError(error, "加载模型列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchModels();
  }, []);

  const handleCreate = async () => {
    try {
      if (!formData.name || !formData.provider || !formData.model) {
        handleError(new Error("请填写必填字段"), "创建失败");
        return;
      }
      await createLLMModel(formData as LLMModelCreate);
      setIsCreateDialogOpen(false);
      setFormData({});
      fetchModels();
    } catch (error) {
      handleError(error, "创建模型失败");
    }
  };

  const handleEdit = async () => {
    if (!selectedModel) return;
    try {
      await updateLLMModel(selectedModel.id, formData as LLMModelUpdate);
      setIsEditDialogOpen(false);
      setSelectedModel(null);
      setFormData({});
      fetchModels();
    } catch (error) {
      handleError(error, "更新模型失败");
    }
  };

  const handleDelete = async () => {
    if (!selectedModel) return;
    try {
      await deleteLLMModel(selectedModel.id);
      setIsDeleteDialogOpen(false);
      setSelectedModel(null);
      fetchModels();
    } catch (error) {
      handleError(error, "删除模型失败");
    }
  };

  const handleOpenEditDialog = (model: LLMModel) => {
    setSelectedModel(model);
    setFormData({
      name: model.name,
      provider: model.provider,
      model: model.model,
      api_key: model.api_key,
      api_base: model.api_base,
      description: model.description,
      is_active: model.is_active,
      is_default: model.is_default,
    });
    setIsEditDialogOpen(true);
  };

  const handleOpenDeleteDialog = (model: LLMModel) => {
    setSelectedModel(model);
    setIsDeleteDialogOpen(true);
  };

  // Data Table 状态
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columnsToggleable = useMemo(
    () => [
      { id: "name", label: "模型名称" },
      { id: "provider", label: "提供商" },
      { id: "model", label: "模型标识" },
      { id: "is_active", label: "状态" },
      { id: "is_default", label: "默认" },
    ],
    []
  );

  const renderSortIcon = useCallback((sorted: false | "asc" | "desc") => {
    return <SortIcon sorted={sorted} />;
  }, []);

  const columns = useMemo<ColumnDef<LLMModel>[]>(
    () => [
      {
        id: "search",
        accessorFn: (row) => `${row.name} ${row.provider} ${row.model}`,
        enableSorting: false,
        enableHiding: false,
        filterFn: "includesString",
        header: () => null,
        cell: () => null,
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            模型名称
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
      },
      {
        accessorKey: "provider",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            提供商
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.provider}</Badge>
        ),
      },
      {
        accessorKey: "model",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            模型标识
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="font-mono text-sm">{row.original.model}</div>
        ),
      },
      {
        accessorKey: "is_active",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            状态
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? "default" : "secondary"}>
            {row.original.is_active ? "激活" : "禁用"}
          </Badge>
        ),
      },
      {
        accessorKey: "is_default",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            默认
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          row.original.is_default ? <Badge variant="default">默认</Badge> : <span className="text-muted-foreground">-</span>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">操作</div>,
        cell: ({ row }) => {
          const model = row.original;
          return (
            <ActionButtons
              onEdit={() => handleOpenEditDialog(model)}
              onDelete={() => handleOpenDeleteDialog(model)}
              canEdit={true}
              canDelete={true}
              variant="dropdown"
            />
          );
        },
      },
    ],
    [renderSortIcon]
  );

  const table = useReactTable({
    data: models,
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

  if (!mounted) {
    return null;
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title="模型管理"
        description="配置和管理 LLM 模型，支持团队级别的模型配置，参考 Dify 的模型配置逻辑"
        action={null}
      />

      <div className="flex flex-1 min-h-0 flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <Input
              placeholder="搜索模型（名称 / 提供商 / 模型标识）..."
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
            <Button size="sm" className="h-9" onClick={() => {
              setFormData({ provider: "deepseek", is_active: true, is_default: false });
              setIsCreateDialogOpen(true);
            }}>
              <Plus className="mr-2 h-4 w-4" />
              新建模型
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="overflow-hidden rounded-md border bg-background">
            {loading ? (
              <Table>
                <TableBody>
                  <TableSkeleton cols={6} rows={5} />
                </TableBody>
              </Table>
            ) : (
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
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                        {row.getVisibleCells()
                          .filter((cell) => cell.column.id !== "search")
                          .map((cell) => (
                            <TableCell key={cell.id} className={cell.column.id === "actions" ? "text-right" : ""}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-24 text-center">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>

      {/* 创建对话框 */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新建模型</DialogTitle>
            <DialogDescription>配置 LLM 模型的基本信息和 API 参数</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">模型名称 *</Label>
                <Input
                  id="name"
                  placeholder="如：GPT-4、Claude 3 Opus"
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="provider">提供商 *</Label>
                <Select
                  value={formData.provider || ""}
                  onValueChange={(value) => setFormData({ ...formData, provider: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择提供商" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="model">模型标识 *</Label>
              <Input
                id="model"
                placeholder={
                  formData.provider === "doubao"
                    ? "如：doubao-pro-4k、doubao-lite-4k"
                    : formData.provider === "openai"
                    ? "如：gpt-4、gpt-3.5-turbo"
                    : formData.provider === "deepseek"
                    ? "如：deepseek-chat、deepseek-coder"
                    : "如：gpt-4、claude-3-opus-20240229、deepseek-chat"
                }
                value={formData.model || ""}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="api_key">API 密钥</Label>
              <PasswordInput
                id="api_key"
                placeholder="留空则使用环境变量配置"
                value={formData.api_key || ""}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="api_base">API 基础 URL</Label>
              <Input
                id="api_base"
                placeholder={
                  formData.provider === "doubao" 
                    ? "如：https://ark.cn-beijing.volces.com/api/v3（留空则使用默认值）"
                    : formData.provider === "openai"
                    ? "如：https://api.openai.com/v1（留空则使用默认值）"
                    : "如：https://api.openai.com/v1（留空则使用默认值）"
                }
                value={formData.api_base || ""}
                onChange={(e) => setFormData({ ...formData, api_base: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">描述</Label>
              <Textarea
                id="description"
                placeholder="模型描述（可选）"
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active ?? true}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">激活</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="is_default"
                  checked={formData.is_default ?? false}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                />
                <Label htmlFor="is_default">设为默认模型</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑模型</DialogTitle>
            <DialogDescription>修改模型配置信息</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">模型名称 *</Label>
                <Input
                  id="edit-name"
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-provider">提供商 *</Label>
                <Select
                  value={formData.provider || ""}
                  onValueChange={(value) => setFormData({ ...formData, provider: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择提供商" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-model">模型标识 *</Label>
              <Input
                id="edit-model"
                placeholder={
                  formData.provider === "doubao"
                    ? "如：doubao-pro-4k、doubao-lite-4k"
                    : formData.provider === "openai"
                    ? "如：gpt-4、gpt-3.5-turbo"
                    : formData.provider === "deepseek"
                    ? "如：deepseek-chat、deepseek-coder"
                    : "如：gpt-4、claude-3-opus-20240229、deepseek-chat"
                }
                value={formData.model || ""}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-api_key">API 密钥</Label>
              <PasswordInput
                id="edit-api_key"
                placeholder="留空则使用环境变量配置"
                value={formData.api_key || ""}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-api_base">API 基础 URL</Label>
              <Input
                id="edit-api_base"
                placeholder={
                  formData.provider === "doubao" 
                    ? "如：https://ark.cn-beijing.volces.com/api/v3"
                    : formData.provider === "openai"
                    ? "如：https://api.openai.com/v1"
                    : "如：https://api.openai.com/v1"
                }
                value={formData.api_base || ""}
                onChange={(e) => setFormData({ ...formData, api_base: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">描述</Label>
              <Textarea
                id="edit-description"
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="edit-is_active"
                  checked={formData.is_active ?? true}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="edit-is_active">激活</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="edit-is_default"
                  checked={formData.is_default ?? false}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                />
                <Label htmlFor="edit-is_default">设为默认模型</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除模型 "{selectedModel?.name}" 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const ModelsConfigClient = observer(ModelsConfigClientImpl);
