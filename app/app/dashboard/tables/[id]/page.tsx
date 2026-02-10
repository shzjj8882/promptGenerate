import { Metadata } from "next";
import dynamic from "next/dynamic";
import { TableDetailClient } from "./table-detail-client";
import { getTableOnServer } from "@/lib/server-api/tables";

const TableDetailClientDynamic = dynamic(() => import("./table-detail-client").then((mod) => ({ default: mod.TableDetailClient })), {
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-center text-muted-foreground">加载中...</div>
    </div>
  ),
});

export const metadata: Metadata = {
  title: "多维表格详情 - AILY",
};

export default async function TableDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  try {
    // 服务端获取表格数据（包含行数据）
    const tableData = await getTableOnServer(id, true);
    const rowsData = tableData.rows || [];
    
    return (
      <div className="h-full w-full flex flex-col overflow-hidden">
        <TableDetailClientDynamic 
          tableId={id} 
          initialTable={tableData}
          initialRows={rowsData}
        />
      </div>
    );
  } catch {
    // SSR 获取失败时，退回到客户端自行拉取，避免整页报错
    return (
      <div className="h-full w-full flex flex-col overflow-hidden">
        <TableDetailClientDynamic tableId={id} />
      </div>
    );
  }
}
