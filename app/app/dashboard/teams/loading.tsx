import { PageTableLoadingSkeleton } from "@/components/shared/page-loading-skeleton";

export default function TeamsLoading() {
  return (
    <PageTableLoadingSkeleton
      title="团队管理"
      description="管理系统中的团队"
      tableCols={4}
      showSearchBar={true}
      showActionButtons={true}
    />
  );
}
