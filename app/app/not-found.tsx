import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {/* background layers */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(70%_60%_at_50%_35%,black,transparent)]"
      >
        <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-blue-500/12 blur-3xl dark:bg-blue-400/12" />
        <div className="absolute -bottom-40 -right-32 h-[32rem] w-[32rem] rounded-full bg-indigo-500/12 blur-3xl dark:bg-indigo-400/12" />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.06)_1px,transparent_1px)] bg-[size:56px_56px] opacity-[0.08] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.12)_1px,transparent_1px)] dark:opacity-[0.06]"
      />

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12 sm:px-10">
        <div className="grid w-full items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* copy */}
          <section className="order-2 text-center lg:order-1 lg:text-left">
            <div className="mx-auto inline-flex items-center rounded-full border border-zinc-200 bg-white/60 px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200 lg:mx-0">
              404 · Not Found
            </div>

            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl lg:text-5xl dark:text-zinc-50">
              页面不存在
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-zinc-600 sm:text-base dark:text-zinc-300">
              你访问的地址可能已失效、被迁移或从未存在。建议返回控制台继续操作，或重新登录切换账号。
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Button asChild size="lg" className="sm:min-w-[170px]">
                <Link href="/dashboard">返回控制台</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="sm:min-w-[170px] bg-white/40 dark:bg-zinc-950/20">
                <Link href="/login">重新登录</Link>
              </Button>
            </div>
          </section>

          {/* illustration */}
          <section className="order-1 flex justify-center lg:order-2 lg:justify-end">
            <div className="relative w-full max-w-md lg:max-w-xl">
              <div
                aria-hidden
                className="absolute inset-0 -z-10 rounded-3xl bg-white/50 blur-2xl dark:bg-zinc-900/30"
              />
              <Image
                src="/404.svg"
                alt=""
                width={520}
                height={520}
                priority
                className="mx-auto h-72 w-auto object-contain sm:h-[22rem] lg:h-[26rem]"
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
