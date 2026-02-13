import { Metadata } from "next";
import dynamic from "next/dynamic";
import { ScenesConfigClient } from "./scenes-config-client";

const ScenesConfigClientDynamic = dynamic(() => import("./scenes-config-client").then((mod) => ({ default: mod.ScenesConfigClient })), {
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-center text-muted-foreground">加载中...</div>
    </div>
  ),
});

export const metadata: Metadata = {
  title: "场景值配置 - PromptHub",
};

export default function ScenesConfigPage() {
  return <ScenesConfigClientDynamic />;
}
