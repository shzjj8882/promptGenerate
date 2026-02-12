import {
  Search,
  FileText,
  TrendingUp,
  Headphones,
  BarChart3,
  Bot,
} from "lucide-react";
import { LandingAnimateIn } from "./landing-animate-in";

const useCases = [
  {
    icon: Search,
    title: "市场调研",
    description: "配置调研场景的提示词模板，占位符自动注入调研对象、行业背景，快速生成调研报告与洞察分析。",
    benefit: "调研效率提升 3x",
  },
  {
    icon: FileText,
    title: "PPT 报告",
    description: "预设 PPT 报告生成场景，支持多页结构、图表占位符，一键生成符合企业风格的汇报材料。",
    benefit: "报告制作时间缩短 80%",
  },
  {
    icon: TrendingUp,
    title: "销售打单",
    description: "销售场景的 DMU 分析、客户画像占位符，自动生成打单建议与跟进策略，提升成交率。",
    benefit: "销售转化率提升",
  },
  {
    icon: Headphones,
    title: "智能客服",
    description: "客服场景的提示词配置，支持知识库占位符、工单上下文注入，实现智能问答与工单处理。",
    benefit: "客服响应时间缩短",
  },
  {
    icon: BarChart3,
    title: "数据分析",
    description: "数据分析场景的提示词模板，占位符注入业务指标、图表数据，自动生成分析结论与建议。",
    benefit: "数据洞察自动化",
  },
  {
    icon: Bot,
    title: "自定义场景",
    description: "灵活创建任意业务场景，配置专属占位符与提示词，满足企业个性化 AI 应用需求。",
    benefit: "无限扩展可能",
  },
];

const useCaseColors = ["emerald", "blue", "violet", "amber", "rose", "cyan"] as const;
const useCaseIconClasses: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  cyan: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
};
const useCaseCornerClasses: Record<string, string> = {
  emerald: "bg-emerald-400/30 group-hover:bg-emerald-400/50",
  blue: "bg-blue-400/30 group-hover:bg-blue-400/50",
  violet: "bg-violet-400/30 group-hover:bg-violet-400/50",
  amber: "bg-amber-400/30 group-hover:bg-amber-400/50",
  rose: "bg-rose-400/30 group-hover:bg-rose-400/50",
  cyan: "bg-cyan-400/30 group-hover:bg-cyan-400/50",
};

export function LandingUseCases() {
  return (
    <section id="use-cases" className="flex min-h-screen min-h-[100dvh] flex-col justify-center scroll-mt-14 border-t border-border px-4 py-20 sm:px-6 sm:py-28">
      <div className="container mx-auto max-w-6xl">
        <LandingAnimateIn>
          <div className="text-center">
            <span className="inline-block rounded-full bg-blue-500/15 px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400">
              使用场景
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              覆盖多种业务场景
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              从市场调研到销售打单，从 PPT 报告到智能客服，一平台配置，多场景复用
            </p>
          </div>
        </LandingAnimateIn>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((item, i) => {
            const Icon = item.icon;
            const colorKey = useCaseColors[i % useCaseColors.length];
            const colorClass = useCaseIconClasses[colorKey];
            const cornerClass = useCaseCornerClasses[colorKey];
            return (
              <LandingAnimateIn key={item.title} delay={i * 80} className="h-full">
                <div className="flex h-full flex-col group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5">
                  <div className={`absolute -right-8 -top-8 h-24 w-24 rounded-full transition-all duration-300 group-hover:scale-110 ${cornerClass}`} />
                  <div className="relative flex flex-1 flex-col">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${colorClass}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 font-semibold">{item.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                    <div className={`mt-4 inline-flex items-center rounded-lg ${colorClass} px-3 py-1.5 text-xs font-medium`}>
                      {item.benefit}
                    </div>
                  </div>
                </div>
              </LandingAnimateIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}
