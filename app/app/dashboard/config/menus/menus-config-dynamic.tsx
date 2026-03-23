"use client";

import dynamic from "next/dynamic";

const MenusConfigClientDynamic = dynamic(
  () => import("./menus-config-client").then((mod) => ({ default: mod.MenusConfigClient })),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">加载中...</div>
      </div>
    ),
    ssr: false,
  }
);

export function MenusConfigDynamic() {
  return <MenusConfigClientDynamic />;
}
