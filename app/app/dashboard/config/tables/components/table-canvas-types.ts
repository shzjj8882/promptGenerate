/**
 * TableCanvas 视图用类型：筛选等
 */
export type FilterOperator =
  | "contains"
  | "equals"
  | "not_contains"
  | "not_equals"
  | "starts_with"
  | "ends_with";

export type FilterLogic = "and" | "or";

export interface FilterCondition {
  id: string;
  columnKey: string;
  operator: FilterOperator;
  value: string;
}

export interface FilterGroup {
  id: string;
  logic: FilterLogic;
  groupLogic?: FilterLogic;
  conditions: FilterCondition[];
}
