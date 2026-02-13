import { Metadata } from "next";
import dynamic from "next/dynamic";

const NotificationConfigClientDynamic = dynamic(
  () => import("./notification-config-client").then((mod) => ({ default: mod.NotificationConfigClient })),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">加载中...</div>
      </div>
    ),
  }
);

export const metadata: Metadata = {
  title: "通知中心 - PromptHub",
};

export default function NotificationConfigPage() {
  return <NotificationConfigClientDynamic />;
}
