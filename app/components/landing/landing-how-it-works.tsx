import { Settings, Plug, CheckCircle } from "lucide-react";
import { LandingAnimateIn } from "./landing-animate-in";

const steps = [
  {
    step: 1,
    icon: Settings,
    title: "配置场景与占位符",
    description: "创建业务场景，配置占位符与提示词模板。支持多租户、多团队隔离。",
  },
  {
    step: 2,
    icon: Plug,
    title: "接入 API",
    description: "通过结构化接口或聊天接口调用，占位符自动注入业务数据，返回 AI 生成结果。",
  },
  {
    step: 3,
    icon: CheckCircle,
    title: "落地应用",
    description: "集成到您的产品、客服系统或工作流中，持续迭代优化提示词效果。",
  },
];

export function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="flex min-h-screen min-h-[100dvh] flex-col justify-center scroll-mt-14 border-t border-border bg-muted/20 px-4 py-20 sm:px-6 sm:py-28">
      <div className="container mx-auto max-w-6xl">
        <LandingAnimateIn>
          <div className="text-center">
            <span className="inline-block rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              三步上手
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              如何开始使用
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              从配置到接入，简单三步即可将 AI 能力接入你的业务
            </p>
          </div>
        </LandingAnimateIn>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {steps.map((item, i) => {
            const Icon = item.icon;
            return (
              <LandingAnimateIn key={item.step} delay={i * 100}>
              <div
                className="relative rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-amber-500/30 bg-amber-500/10 text-sm font-bold text-amber-600 dark:text-amber-400">
                  {item.step}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Icon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <h3 className="font-semibold">{item.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
              </LandingAnimateIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}
