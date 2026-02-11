import type {
  Permission,
  PermissionsGroupedResponse,
  PermissionsGroupedRawResponse,
} from "@/lib/api/rbac";

/** 按 keyFn 分组，等价于 lodash groupBy */
export function groupBy<T>(arr: T[], keyFn: (x: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const x of arr) {
    const k = keyFn(x);
    if (!out[k]) out[k] = [];
    out[k].push(x);
  }
  return out;
}

/** 菜单权限中属于「路由」的 action，与后端约定一致 */
export const MENU_ROUTE_ACTIONS = ["menu_list", "menu"];

/** 前端用 groupBy 将后端平铺的权限按类型组合 */
export function groupPermissionsByType(raw: PermissionsGroupedRawResponse): PermissionsGroupedResponse {
  const byType = groupBy(raw.items, (p: Permission) => p.type ?? "api");
  // 菜单权限 tab 包含 type=menu（路由）和 type=button（按钮），与后端 type_menu_values 一致
  const menu = [...(byType["menu"] ?? []), ...(byType["button"] ?? [])];
  const api = byType["api"] ?? [];
  const menuRoute = groupBy(
    menu.filter((p: Permission) => MENU_ROUTE_ACTIONS.includes((p.action ?? "").trim())),
    (p: Permission) => p.resource || "other"
  );
  const menuButton = groupBy(
    menu.filter((p: Permission) => !MENU_ROUTE_ACTIONS.includes((p.action ?? "").trim())),
    (p: Permission) => p.resource || "other"
  );
  return {
    menu: { route: menuRoute, button: menuButton },
    api: groupBy(api, (p: Permission) => p.resource || "other"),
    resource_order: raw.resource_order,
    resource_labels: raw.resource_labels,
  };
}

/** 由后端接口返回的 resource_labels 取展示名，无则用 resource 本身 */
export function getGroupLabel(resource: string, labels: Record<string, string> = {}): string {
  return labels[resource] ?? resource;
}

/** 由后端接口返回的 resource_order 与数据取并集，得到要展示的资源顺序 */
export function getOrderedResources(
  dataKeys: string[],
  order: string[] = []
): string[] {
  const ordered = order.filter((g) => dataKeys.includes(g));
  const rest = dataKeys.filter((g) => !order.includes(g));
  return [...ordered, ...rest];
}
