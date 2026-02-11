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
import { Plus, Pencil, Trash2, Settings2, RefreshCw } from "lucide-react";
import {
  getMCPConfigs,
  createMCPConfig,
  deleteMCPConfig,
  verifyMCPConnection,
  refreshMCPTools,
  type MCPConfig,
  type MCPConfigCreate,
  type MCPTool,
} from "@/lib/api/mcp";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronRight } from "lucide-react";

function MCPConfigClientImpl() {
  const [configs, setConfigs] = useState<MCPConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<MCPConfig | null>(null);
  const [formData, setFormData] = useState<Partial<MCPConfigCreate>>({});
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; message?: string; tools?: MCPTool[] } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { handleError } = useErrorHandler({ showToast: true });

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const response = await getMCPConfigs({ limit: 1000 });
      setConfigs(response.items);
    } catch (error) {
      handleError(error, "加载 MCP 列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchConfigs();
  }, []);

  const handleVerify = async () => {
    if (!formData.url?.trim()) {
      handleError(new Error("请输入 MCP 地址"), "验证失败");
      return;
    }
    try {
      setVerifyLoading(true);
      setVerifyResult(null);
      const result = await verifyMCPConnection(
        formData.url.trim(),
        formData.auth_info,
        (formData.transport_type as "sse" | "streamable_http") ?? "sse"
      );
      setVerifyResult({
        success: result.success,
        message: result.message,
        tools: result.tools,
      });
      if (!result.success) {
        handleError(new Error(result.message), "连接验证失败");
      }
    } catch (error) {
      handleError(error, "验证 MCP 连接失败");
      setVerifyResult({ success: false, message: "验证失败" });
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      if (!formData.name?.trim() || !formData.url?.trim()) {
        handleError(new Error("请填写 MCP 名称和地址"), "创建失败");
        return;
      }
      if (!verifyResult?.success) {
        handleError(new Error("请先验证 MCP 连接成功后再创建"), "创建失败");
        return;
      }
      await createMCPConfig({
        name: formData.name.trim(),
        url: formData.url.trim(),
        transport_type: (formData.transport_type as "sse" | "streamable_http") ?? "sse",
        auth_info: formData.auth_info,
        is_active: formData.is_active ?? true,
      });
      setIsCreateDialogOpen(false);
      setFormData({});
      setVerifyResult(null);
      fetchConfigs();
    } catch (error) {
      handleError(error, "创建 MCP 配置失败");
    }
  };

  const handleRefreshTools = async (id: string) => {
    try {
      await refreshMCPTools(id);
      fetchConfigs();
    } catch (error) {
      handleError(error, "刷新工具列表失败");
    }
  };

  const handleDelete = async () => {
    if (!selectedConfig) return;
    try {
      await deleteMCPConfig(selectedConfig.id);
      setIsDeleteDialogOpen(false);
      setSelectedConfig(null);
      fetchConfigs();
    } catch (error) {
      handleError(error, "删除 MCP 配置失败");
    }
  };

  const handleOpenDeleteDialog = (config: MCPConfig) => {
    setSelectedConfig(config);
    setIsDeleteDialogOpen(true);
  };

  const toggleRowExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columnsToggleable = useMemo(
    () => [
      { id: "name", label: "MCP 名称" },
      { id: "url", label: "地址" },
      { id: "tools_count", label: "工具数量" },
      { id: "is_active", label: "状态" },
    ],
    []
  );

  const renderSortIcon = useCallback((sorted: false | "asc" | "desc") => {
    return <SortIcon sorted={sorted} />;
  }, []);

  const columns = useMemo<ColumnDef<MCPConfig>[]>(
    () => [
      {
        id: "search",
        accessorFn: (row) => `${row.name} ${row.url}`,
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
            MCP 名称
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
      },
      {
        accessorKey: "url",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            地址
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="max-w-[200px] truncate font-mono text-sm" title={row.original.url}>
            {row.original.url}
          </div>
        ),
      },
      {
        id: "tools_count",
        accessorFn: (row) => row.tools_cache?.length ?? 0,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            工具数量
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => {
          const count = row.original.tools_cache?.length ?? 0;
          return (
            <div className="flex items-center gap-1">
              <Badge variant="outline">{count} 个</Badge>
              {count > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1"
                  onClick={() => toggleRowExpand(row.original.id)}
                >
                  {expandedRows.has(row.original.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          );
        },
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
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">操作</div>,
        cell: ({ row }) => {
          const config = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => handleRefreshTools(config.id)}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <ActionButtons
                onDelete={() => handleOpenDeleteDialog(config)}
                canEdit={false}
                canDelete={true}
                variant="dropdown"
              />
            </div>
          );
        },
      },
    ],
    [renderSortIcon, expandedRows]
  );

  const table = useReactTable({
    data: configs,
    columns,
    state: { sorting, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (!mounted) return null;

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title="MCP 配置"
        description="配置 MCP (Model Context Protocol) 服务，支持连接外部工具供 LLM 调用"
        action={
          <Button
            size="sm"
            className="h-9"
            onClick={() => {
              setFormData({ is_active: true });
              setVerifyResult(null);
              setIsCreateDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            新建 MCP
          </Button>
        }
      />

      <div className="flex flex-1 min-h-0 flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <Input
              placeholder="搜索（名称 / 地址）..."
              value={(table.getColumn("search")?.getFilterValue() as string) ?? ""}
              onChange={(e) => table.getColumn("search")?.setFilterValue(e.target.value)}
            />
          </div>
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
                    onCheckedChange={(v) => col.toggleVisibility(!!v)}
                  >
                    {c.label}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
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
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id} className="bg-muted/40">
                      {hg.headers
                        .filter((h) => h.column.id !== "search")
                        .map((header) => (
                          <TableHead
                            key={header.id}
                            className={header.column.id === "actions" ? "text-right" : ""}
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
                      <>
                        <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                          {row.getVisibleCells()
                            .filter((c) => c.column.id !== "search")
                            .map((cell) => (
                              <TableCell
                                key={cell.id}
                                className={cell.column.id === "actions" ? "text-right" : ""}
                              >
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </TableCell>
                            ))}
                        </TableRow>
                        {expandedRows.has(row.original.id) &&
                          row.original.tools_cache &&
                          row.original.tools_cache.length > 0 && (
                            <TableRow>
                              <TableCell colSpan={6} className="bg-muted/20">
                                <div className="py-2 pl-4">
                                  <div className="text-sm font-medium mb-2">工具列表（子功能）</div>
                                  <div className="flex flex-wrap gap-2">
                                    {row.original.tools_cache.map((t) => (
                                      <Badge key={t.name} variant="secondary" className="font-normal">
                                        {t.title || t.name}: {t.description || "-"}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                      </>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
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

      {/* 新建对话框 */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新建 MCP</DialogTitle>
            <DialogDescription>
              配置 MCP 服务，创建前需验证连接并获取工具列表
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">MCP 名称 *</Label>
              <Input
                id="name"
                placeholder="如：天气查询 MCP"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="url">MCP 地址 *</Label>
              <Input
                id="url"
                placeholder="如：https://example.com/mcp/sse 或 https://example.com/mcp"
                value={formData.url || ""}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="transport_type">传输协议</Label>
              <select
                id="transport_type"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.transport_type ?? "sse"}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    transport_type: e.target.value as "sse" | "streamable_http",
                  })
                }
              >
                <option value="sse">SSE（Server-Sent Events）</option>
                <option value="streamable_http">Streamable HTTP</option>
              </select>
              <p className="text-xs text-muted-foreground">
                SSE 适用于传统 MCP 端点（如 /sse）；Streamable HTTP 适用于第三方平台（如魔搭）及较新的 MCP 服务
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="auth_info">授权信息（JSON）</Label>
              <Textarea
                id="auth_info"
                placeholder='{"Authorization": "Bearer xxx"} 或 {"api_key": "xxx"}'
                value={
                  formData.auth_info
                    ? JSON.stringify(formData.auth_info, null, 2)
                    : ""
                }
                onChange={(e) => {
                  try {
                    const v = e.target.value.trim();
                    const parsed = v ? JSON.parse(v) : undefined;
                    setFormData({ ...formData, auth_info: parsed });
                  } catch {
                    // 忽略无效 JSON
                  }
                }}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active ?? true}
                onCheckedChange={(c) => setFormData({ ...formData, is_active: c })}
              />
              <Label htmlFor="is_active">激活</Label>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleVerify}
                disabled={verifyLoading || !formData.url?.trim()}
              >
                {verifyLoading ? "验证中..." : "验证连接并获取工具"}
              </Button>
              {verifyResult && (
                <span
                  className={
                    verifyResult.success
                      ? "text-green-600"
                      : "text-destructive"
                  }
                >
                  {verifyResult.success
                    ? `✓ ${verifyResult.message}`
                    : `✗ ${verifyResult.message}`}
                </span>
              )}
            </div>
            {verifyResult?.success && verifyResult.tools && verifyResult.tools.length > 0 && (
              <div className="rounded-md border p-3">
                <div className="text-sm font-medium mb-2">已获取 {verifyResult.tools.length} 个工具</div>
                <div className="flex flex-wrap gap-2">
                  {verifyResult.tools.map((t) => (
                    <Badge key={t.name} variant="secondary">
                      {t.title || t.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!verifyResult?.success}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除 MCP 配置 "{selectedConfig?.name}" 吗？此操作不可撤销。
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

export const MCPConfigClient = observer(MCPConfigClientImpl);
