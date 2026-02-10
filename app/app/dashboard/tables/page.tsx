import { Metadata } from "next";
import dynamic from "next/dynamic";
import { getTablesOnServer } from "@/lib/server-api/tables";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

// 动态导入多维表格客户端组件
const TablesClient = dynamic(() => import("./tables-client").then((mod) => ({ default: mod.TablesClient })), {
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-center text-muted-foreground">加载中...</div>
    </div>
  ),
});

export const metadata: Metadata = {
  title: "多维表格 - AILY",
};

export default async function TablesPage() {
  try {
    const { items, total } = await getTablesOnServer({ skip: 0, limit: DEFAULT_PAGE_SIZE });
    return (
      <TablesClient
        initialTables={items}
        initialTotal={total}
        initialPage={1}
      />
    );
  } catch {
    // SSR 获取失败时，退回到客户端自行拉取，避免整页报错
    return <TablesClient />;
  }
}
