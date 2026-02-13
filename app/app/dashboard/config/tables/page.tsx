import { Metadata } from "next";
import dynamic from "next/dynamic";
import { TablesConfigClient } from "./tables-config-client";

const TablesConfigClientDynamic = dynamic(() => import("./tables-config-client").then((mod) => ({ default: mod.TablesConfigClient })), {
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-center text-muted-foreground">加载中...</div>
    </div>
  ),
});

export const metadata: Metadata = {
  title: "多维表格配置 - PromptHub",
};

export default function TablesConfigPage() {
  return (
    <div className="h-full p-4">
      <TablesConfigClientDynamic />
    </div>
  );
}
