import { PageCardListLoadingSkeleton } from "@/components/shared/page-loading-skeleton";

export default function PromptsLoading() {
  return (
    <PageCardListLoadingSkeleton
      title="提示词管理"
      description="创建和管理提示词模板，支持多场景、多租户配置"
      showFilters={true}
      cardCount={6}
    />
  );
}
