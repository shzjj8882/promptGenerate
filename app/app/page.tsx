import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingFeatures } from "@/components/landing/landing-features";
import { LandingUseCases } from "@/components/landing/landing-use-cases";
import { LandingEnterpriseValue } from "@/components/landing/landing-enterprise-value";
import { LandingHowItWorks } from "@/components/landing/landing-how-it-works";
import { LandingFooter } from "@/components/landing/landing-footer";
import { StructuredData } from "@/components/landing/structured-data";

export const metadata: Metadata = {
  title: "PromptHub - 智能体占位符 SaaS 平台 | 占位符生成、接口、聊天",
  description:
    "PromptHub 提供智能体占位符的配置与生成，支持结构化 API 和流式聊天接口，多场景、多租户，助力业务快速接入 AI 能力。",
  keywords: [
    "PromptHub",
    "智能体",
    "占位符",
    "SaaS",
    "提示词",
    "LLM",
    "API",
    "聊天接口",
  ],
  openGraph: {
    title: "PromptHub - 智能体占位符 SaaS 平台",
    description:
      "占位符生成、结构化接口、聊天接口，多场景多租户提示词管理",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function HomePage() {
  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col">
      <StructuredData />
      <LandingHeader />
      {/* 首屏：Hero 占满视口，导航 sticky 常驻顶部 */}
      <div id="hero" className="flex min-h-screen min-h-[100dvh] flex-col">
        <LandingHero />
      </div>
      <main className="flex-1">
        <LandingFeatures />
        <LandingUseCases />
        <LandingEnterpriseValue />
        <LandingHowItWorks />
      </main>
      <LandingFooter />
    </div>
  );
}
