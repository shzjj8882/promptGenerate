import { LANDING_BRAND } from "@/lib/landing-config";

/**
 * JSON-LD 结构化数据，用于 SEO
 */
export function StructuredData() {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: LANDING_BRAND.name,
    applicationCategory: "DeveloperApplication",
    description:
      "智能体占位符 SaaS 平台，提供占位符生成、结构化 API 和流式聊天接口，多场景多租户提示词管理",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "CNY",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
