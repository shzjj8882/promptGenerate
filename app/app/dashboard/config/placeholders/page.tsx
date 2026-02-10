import { Metadata } from "next";
import dynamic from "next/dynamic";
import { PlaceholdersConfigClient } from "./placeholders-config-client";

const PlaceholdersConfigClientDynamic = dynamic(() => import("./placeholders-config-client").then((mod) => ({ default: mod.PlaceholdersConfigClient })), {
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-center text-muted-foreground">加载中...</div>
    </div>
  ),
});

export const metadata: Metadata = {
  title: "占位符编辑设计 - AILY",
};

export default function PlaceholdersConfigPage() {
  return <PlaceholdersConfigClientDynamic />;
}
