import {
  Zap,
  MessageSquare,
  Plug,
  Shield,
  Layers,
  Mail,
} from "lucide-react";
import { LandingAnimateIn } from "./landing-animate-in";

const features = [
  {
    icon: Zap,
    title: "占位符生成",
    description: "灵活配置占位符，支持动态数据注入，多场景提示词模板管理",
    color: "emerald",
  },
  {
    icon: MessageSquare,
    title: "聊天接口",
    description: "流式对话 API，自动处理占位符替换，支持上下文管理",
    color: "blue",
  },
  {
    icon: Plug,
    title: "结构化接口",
    description: "提供标准化 API，支持 Prompt 调用、多维表格等能力",
    color: "violet",
  },
  {
    icon: Layers,
    title: "多场景支持",
    description: "调研、PPT、销售等场景的提示词配置，租户隔离",
    color: "amber",
  },
  {
    icon: Mail,
    title: "通知中心",
    description: "邮件通知配置，异步任务完成提醒，SendCloud 集成",
    color: "rose",
  },
  {
    icon: Shield,
    title: "权限管理",
    description: "RBAC 角色权限，菜单配置，团队与多租户隔离",
    color: "cyan",
  },
];

const colorClasses: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  cyan: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
};

export function LandingFeatures() {
  return (
    <section id="features" className="flex min-h-screen min-h-[100dvh] flex-col justify-center scroll-mt-14 border-t border-border bg-muted/30 px-4 py-20 sm:px-6 sm:py-28">
      <div className="container mx-auto max-w-6xl">
        <LandingAnimateIn>
          <div className="text-center">
            <span className="inline-block rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              核心能力
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              产品能力
            </h2>
            <p className="mt-3 text-muted-foreground">
              从占位符到接口，一站式 AI 能力接入
            </p>
          </div>
        </LandingAnimateIn>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            const colorClass = colorClasses[feature.color] || colorClasses.emerald;
            return (
              <LandingAnimateIn key={feature.title} delay={i * 60} className="h-full">
                <div className="flex h-full flex-col rounded-xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:border-primary/20 hover:bg-card/80 hover:-translate-y-0.5 hover:shadow-md">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorClass}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">
                  {feature.description}
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
