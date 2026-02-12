import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LandingAnimateIn } from "./landing-animate-in";

export function LandingCta() {
  return (
    <section className="relative flex min-h-screen min-h-[100dvh] flex-col justify-center overflow-hidden px-4 py-20 sm:px-6 sm:py-28">
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-emerald-500/5 via-transparent to-transparent" />
      <div className="container mx-auto max-w-3xl text-center">
        <LandingAnimateIn>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            立即开始使用
          </h2>
          <p className="mt-3 text-muted-foreground">
            配置占位符与提示词，接入你的 AI 应用
          </p>
          <div className="mt-8">
            <Button size="lg" asChild className="h-12 px-10">
              <Link href="/login">进入控制台</Link>
            </Button>
          </div>
        </LandingAnimateIn>
      </div>
    </section>
  );
}
