import { Metadata } from "next";
import dynamic from "next/dynamic";

const MCPConfigClientDynamic = dynamic(
  () => import("./mcp-config-client").then((mod) => ({ default: mod.MCPConfigClient })),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">加载中...</div>
      </div>
    ),
  }
);

export const metadata: Metadata = {
  title: "MCP 配置 - PromptHub",
};

export default function MCPConfigPage() {
  return <MCPConfigClientDynamic />;
}
