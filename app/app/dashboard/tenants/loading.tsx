import { PageTableLoadingSkeleton } from "@/components/shared/page-loading-skeleton";

export default function TenantsLoading() {
  return (
    <PageTableLoadingSkeleton
      title="租户管理"
      description="管理系统中的所有租户"
      tableCols={4}
      showSearchBar={true}
      showActionButtons={true}
    />
  );
}
