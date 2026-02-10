"use client";

import { useEffect, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/shared/page-header";
import { usePagination } from "@/hooks/use-pagination";
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog";
import { TableCard } from "@/components/shared/table-card";
import { useTables } from "./hooks/use-tables";
import { useTableForm } from "./hooks/use-table-form";
import { useTableDelete } from "./hooks/use-table-delete";
import { TableFormDialog } from "./components/table-form-dialog";
import { MultiDimensionTable } from "@/lib/api/multi-dimension-tables";
import { Table } from "lucide-react";
import {
  MENU_BUTTON_PERMISSIONS,
  BUTTON_PERMISSIONS,
  useHasMenuButtonPermission,
  useHasButtonPermission,
} from "@/lib/permissions";

type TablesClientProps = {
  initialTables?: MultiDimensionTable[];
  initialTotal?: number;
  initialPage?: number;
};

function TablesClientImpl({
  initialTables,
  initialTotal,
  initialPage = 1,
}: TablesClientProps) {
  const router = useRouter();
  const canCreate = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.tables?.create);
  const canUpdate = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.tables?.update);
  const canDelete = useHasMenuButtonPermission(MENU_BUTTON_PERMISSIONS.tables?.delete);
  // 接口级权限
  const canCreateApi = useHasButtonPermission(BUTTON_PERMISSIONS.tables?.create);
  const canUpdateApi = useHasButtonPermission(BUTTON_PERMISSIONS.tables?.update);
  const canDeleteApi = useHasButtonPermission(BUTTON_PERMISSIONS.tables?.delete);

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

  // 数据管理 Hooks
  const { tables, loading, error: tablesError, fetchTables } = useTables({
    initialTables,
    initialTotal,
    onTotalChange: setTotalCount,
  });

  // 刷新表格列表的回调函数
  const handleTablesChange = useCallback(async () => {
    await fetchTables(currentPage);
  }, [currentPage, fetchTables]);

  // 表单管理 Hook
  const tableForm = useTableForm({
    canCreateApi,
    tables,
    onTablesChange: handleTablesChange,
  });

  // 删除管理 Hook
  const tableDelete = useTableDelete({
    canDeleteApi,
    tables,
    currentPage,
    onPageChange: setCurrentPage,
    onTablesChange: handleTablesChange,
  });

  // 表格列表：分页加载；首屏有 SSR 数据时不重复请求
  useEffect(() => {
    if (initialTables && initialTables.length > 0 && currentPage === initialPage) {
      return;
    }
    fetchTables(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, initialTables, initialPage]);

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title="多维表格"
        description="管理多维表格配置（每个团队可以有多个表格）"
        action={canCreate ? (
          <Button onClick={tableForm.handleCreate}>
            新建表格
          </Button>
        ) : undefined}
      />

      {/* 错误提示 */}
      {(tablesError || tableForm.error || tableDelete.error) && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
          {tablesError || tableForm.error || tableDelete.error}
        </div>
      )}

      {/* 列表 + 分页：中间可滚动，分页固定在底部 */}
      <div className="flex flex-1 min-h-0 flex-col gap-4">
        {/* 表格列表 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : tables.length === 0 ? (
            <div className="flex items-center justify-center min-h-full">
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Table className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-base font-medium text-foreground mb-1">
                  暂无表格数据
                </h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  {canCreate
                    ? "创建您的第一个多维表格，开始管理和组织数据"
                    : "当前没有可用的多维表格"}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {tables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  onEdit={() => {
                    router.push(`/dashboard/tables/${table.id}`);
                  }}
                  onDelete={tableDelete.handleDeleteClick}
                  canEdit={canUpdate}
                  canDelete={canDelete}
                />
              ))}
            </div>
          )}
        </div>

        {/* 分页组件 */}
        {!loading && tables.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            onPageChange={setCurrentPage}
            disabled={loading}
          />
        )}
      </div>

      {/* 创建表格对话框 */}
      <TableFormDialog
        open={tableForm.isDialogOpen}
        onOpenChange={(open) => {
          tableForm.setIsDialogOpen(open);
          if (!open) {
            tableForm.setError("");
          }
        }}
        code={tableForm.newTableCode}
        name={tableForm.newTableName}
        description={tableForm.newTableDescription}
        onCodeChange={tableForm.setNewTableCode}
        onNameChange={tableForm.setNewTableName}
        onDescriptionChange={tableForm.setNewTableDescription}
        onSubmit={tableForm.handleSubmit}
        isSubmitting={tableForm.isSubmitting}
        error={tableForm.error}
      />

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={tableDelete.deleteDialogOpen}
        onOpenChange={(open) => {
          tableDelete.setDeleteDialogOpen(open);
        }}
        title="确认删除"
        description={`确定要删除表格 "${tableDelete.tableToDelete?.name || ""}" 吗？此操作将删除表格及其所有数据，且无法恢复。`}
        onConfirm={tableDelete.handleConfirmDelete}
        loading={!!tableDelete.deleteLoading}
      />
    </div>
  );
}

export const TablesClient = observer(TablesClientImpl);
