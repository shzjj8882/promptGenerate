"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Plus,
  Settings2,
} from "lucide-react";
import { Tenant } from "@/lib/api/tenants";
import { MENU_BUTTON_PERMISSIONS, useHasMenuButtonPermission } from "@/lib/permissions";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/shared/page-header";
import { SortIcon } from "@/components/shared/sort-icon";
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog";
import { usePagination } from "@/hooks/use-pagination";
import { TableState } from "@/components/shared/table-state";
import { ActionButtons } from "@/components/shared/action-buttons";
import { TableSkeleton } from "@/components/shared/table-skeleton";
import { useTenantsData } from "./hooks/use-tenants-data";
import { useTenantForm } from "./hooks/use-tenant-form";
import { useTenantDelete } from "./hooks/use-tenant-delete";
import { TenantFormDialog } from "./components/tenant-form-dialog";

type TenantsClientProps = {
  initialTenants?: Tenant[];
  initialTotal?: number;
  initialPage?: number;
};

function TenantsClientImpl({
  initialTenants,
  initialTotal,
  initialPage = 1,
}: TenantsClientProps) {
  // 新建/编辑/删除由「菜单权限」控制显隐（与后端接口校验无关）
  const canCreate = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.tenant.create);
  const canUpdate = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.tenant.update);
  const canDelete = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.tenant.delete);

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

  // 数据管理 Hook
  const { tenants, loading, error: tenantsError, fetchTenants } = useTenantsData({
    initialTenants,
    initialTotal,
    onTotalChange: setTotalCount,
  });

  // 表单管理 Hook
  const tenantForm = useTenantForm({
    onTenantsChange: useCallback(async () => {
      await fetchTenants(currentPage);
    }, [currentPage, fetchTenants]),
  });

  // 删除管理 Hook
  const tenantDelete = useTenantDelete({
    tenants,
    currentPage,
    onPageChange: setCurrentPage,
    onTenantsChange: fetchTenants,
  });

  // Data Table 状态（参考 shadcn/ui data-table）
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ search: false });

  const columnsToggleable = useMemo(
    () => [
      { id: "code_id", label: "编号ID" },
      { id: "name", label: "租户名称" },
      { id: "created_at", label: "创建时间" },
    ],
    []
  );

  const renderSortIcon = useCallback((sorted: false | "asc" | "desc") => {
    return <SortIcon sorted={sorted} />;
  }, []);

  // 租户列表：分页加载；首屏有 SSR 数据时不重复请求
  useEffect(() => {
    if (initialTenants && initialTenants.length > 0 && currentPage === initialPage) {
      return;
    }
    fetchTenants(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, initialTenants, initialPage]);

  const columns = useMemo<ColumnDef<Tenant>[]>(
    () => [
      // 用于全局搜索（编号/名称），隐藏不展示
      {
        id: "search",
        accessorFn: (row) => `${row.code_id} ${row.name}`,
        enableSorting: false,
        enableHiding: false,
        filterFn: "includesString",
        header: () => null,
        cell: () => null,
      },
      {
        accessorKey: "code_id",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            编号ID
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="font-mono text-sm">{row.original.code_id}</div>
        ),
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
            租户名称
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            创建时间
            {renderSortIcon(column.getIsSorted())}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {new Date(row.original.created_at).toLocaleString("zh-CN")}
          </div>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">操作</div>,
        cell: ({ row }) => {
          const tenant = row.original;
          return (
            <ActionButtons
              onEdit={() => tenantForm.handleEdit(tenant)}
              onDelete={() => tenantDelete.handleDeleteClick(tenant)}
              canEdit={canUpdate}
              canDelete={canDelete}
              deleteLoading={tenantDelete.deleteLoading === tenant.id}
              variant="dropdown"
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canDelete, canUpdate, tenantDelete.deleteLoading, tenantForm.handleEdit, tenantDelete.handleDeleteClick, renderSortIcon]
  );

  const table = useReactTable({
    data: tenants,
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
        title="租户管理"
        description="管理系统中的所有租户"
        action={null /* 迁移到表格工具栏右侧 */}
      />

      {/* 列表 + 分页：中间可滚动，分页固定在底部 */}
      <div className="flex flex-1 min-h-0 flex-col gap-4">
        {/* 顶部工具栏（搜索等） */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <Input
              placeholder="搜索租户（编号 / 名称）..."
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
            {canCreate && (
              <Button size="sm" className="h-9" onClick={tenantForm.handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                新建租户
              </Button>
            )}
          </div>
        </div>

        {/* 租户列表 */}
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
                  <TableSkeleton rows={5} cols={4} />
                ) : (
                  <>
                    <TableState
                      loading={false}
                      empty={!table.getRowModel().rows?.length}
                      colSpan={4}
                      emptyText="暂无租户数据"
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

        {!loading && tenants.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            onPageChange={setCurrentPage}
            disabled={loading}
          />
        )}
      </div>

      {/* 创建/编辑对话框 */}
      <TenantFormDialog
        open={tenantForm.isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            tenantForm.closeFormDialog();
            tenantForm.setError("");
            tenantForm.reset();
          }
        }}
        editingTenant={tenantForm.editingTenant}
        error={tenantForm.error}
        register={tenantForm.register}
        handleSubmit={tenantForm.handleSubmit}
        errors={tenantForm.errors}
        isSubmitting={tenantForm.isSubmitting}
        onClose={() => {
          tenantForm.closeFormDialog();
          tenantForm.setError("");
          tenantForm.reset();
        }}
        onSubmit={tenantForm.onSubmit}
        reset={tenantForm.reset}
      />

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={tenantDelete.deleteDialogOpen}
        onOpenChange={(open) => {
          tenantDelete.setDeleteDialogOpen(open);
          if (!open) {
            tenantDelete.setDeleteConfirmName("");
            tenantDelete.setHasRelatedData(false);
            tenantDelete.setError("");
          }
        }}
        title="确认删除"
        description={`确定要删除租户 ${tenantDelete.tenantToDelete?.name || ""} 吗？`}
        itemName={tenantDelete.tenantToDelete?.name}
        requireConfirmName={tenantDelete.hasRelatedData}
        confirmName={tenantDelete.deleteConfirmName}
        onConfirmNameChange={(value) => {
          tenantDelete.setDeleteConfirmName(value);
          tenantDelete.setError("");
        }}
        warningMessage={
          tenantDelete.hasRelatedData ? (
            <>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                警告：该租户包含关联数据
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                该租户存在提示词数据，删除操作将影响这些数据。
              </p>
            </>
          ) : undefined
        }
        error={tenantDelete.error}
        onConfirm={tenantDelete.handleConfirmDelete}
        loading={!!tenantDelete.deleteLoading}
      />
    </div>
  );
}

export const TenantsClient = observer(TenantsClientImpl);
