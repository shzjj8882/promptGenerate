"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ConfigPage() {
  const router = useRouter();

  useEffect(() => {
    // 重定向到第一个子菜单：场景配置
    router.replace("/dashboard/config/scenes");
  }, [router]);

  return null;
}
