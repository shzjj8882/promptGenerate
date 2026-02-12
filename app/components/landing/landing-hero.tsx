import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PromptHubStroke } from "./prompthub-stroke";

export function LandingHero() {
  return (
    <section className="relative flex flex-1 flex-col justify-center overflow-hidden px-4 py-12 sm:px-6 sm:py-16 md:py-20">
      {/* 背景装饰 */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(0,0,0,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.04)_1px,transparent_1px)] bg-[size:3rem_3rem] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)]" />
      <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl animate-landing-float" />
      <div className="absolute -left-40 bottom-0 h-60 w-60 rounded-full bg-blue-500/10 blur-3xl animate-landing-float" style={{ animationDelay: "1s" }} />
      <div className="container mx-auto max-w-5xl text-center">
        {/* PromptHub 一笔写出动画 */}
        <div>
          <PromptHubStroke />
        </div>
        <p className="mx-auto mt-14 max-w-2xl text-lg text-muted-foreground sm:mt-16 sm:text-xl">
          提供智能体占位符的配置与生成，支持结构化 API 和流式聊天接口，
          多场景、多租户，助力业务快速接入 AI 能力。
        </p>
        <div className="mt-10">
          <Button size="lg" asChild className="h-11 px-8">
            <Link href="/login">进入控制台</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
