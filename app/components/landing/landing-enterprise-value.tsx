import { Rocket, Shield, Users, Zap } from "lucide-react";
import { LandingAnimateIn } from "./landing-animate-in";

const values = [
  {
    icon: Zap,
    title: "快速接入",
    description: "无需自建 LLM 基础设施，开箱即用。配置占位符与提示词即可接入 API，节省开发周期",
    color: "emerald",
  },
  {
    icon: Rocket,
    title: "降本增效",
    description: "统一管理提示词与占位符，减少重复开发。多场景复用，显著降低 AI 应用开发与维护成本",
    color: "amber",
  },
  {
    icon: Users,
    title: "多租户隔离",
    description: "团队级、租户级数据隔离，权限精细化。支持企业多团队、多项目并行使用，安全可控",
    color: "blue",
  },
  {
    icon: Shield,
    title: "安全合规",
    description: "RBAC 权限体系、API Key 认证、数据脱敏。满足企业级安全与合规要求，保障数据安全",
    color: "violet",
  },
];

const valueColorClasses: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

export function LandingEnterpriseValue() {
  return (
    <section id="enterprise" className="flex min-h-screen min-h-[100dvh] flex-col justify-center scroll-mt-14 border-t border-border bg-gradient-to-b from-muted/50 to-transparent px-4 py-20 sm:px-6 sm:py-28">
      <div className="container mx-auto max-w-6xl">
        <LandingAnimateIn>
          <div className="text-center">
            <span className="inline-block rounded-full bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-600 dark:text-violet-400">
              企业价值
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              为企业带来什么
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              从接入效率到成本控制，从数据隔离到安全合规，PromptHub 助力企业 AI 落地
            </p>
          </div>
        </LandingAnimateIn>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((item, i) => {
            const Icon = item.icon;
            return (
              <LandingAnimateIn key={item.title} delay={i * 80}>
                <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-6 text-center shadow-sm transition-all duration-300 hover:border-primary/20 hover:shadow-md hover:-translate-y-0.5">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${valueColorClasses[item.color]}`}>
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="mt-4 font-semibold">{item.title}</h3>
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
