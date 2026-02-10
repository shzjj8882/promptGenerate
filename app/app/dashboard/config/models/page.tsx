import { Metadata } from "next";
import dynamic from "next/dynamic";

const ModelsConfigClientDynamic = dynamic(() => import("./models-config-client").then((mod) => ({ default: mod.ModelsConfigClient })), {
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-center text-muted-foreground">加载中...</div>
    </div>
  ),
});

export const metadata: Metadata = {
  title: "模型管理 - AILY",
};

export default function ModelsConfigPage() {
  return <ModelsConfigClientDynamic />;
}
