import { PageTableLoadingSkeleton } from "@/components/shared/page-loading-skeleton";

export default function RBACLoading() {
  return (
    <PageTableLoadingSkeleton
      title="权限管理"
      description="管理系统权限和角色"
      tableCols={5}
      showSearchBar={true}
      showActionButtons={true}
    />
  );
}
