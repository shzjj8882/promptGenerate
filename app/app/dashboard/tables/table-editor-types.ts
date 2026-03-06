import type { TableRow as TableRowType } from "@/lib/api/multi-dimension-tables";
import type { TableColumn } from "@/lib/api/multi-dimension-tables";

export type HistoryStepType = "initial" | "update" | "add" | "delete" | "import" | "reorder";

export interface HistoryState {
  rows: TableRowType[];
  columns: TableColumn[];
  stepLabel?: string;
  stepType?: HistoryStepType;
  /** 标题：某处数据发生变化的简短概括 */
  stepTitle?: string;
  /** 描述：变化前后的具体内容（如 原值 → 新值） */
  stepDescription?: string;
}

export interface CompletedHistoryEntry {
  id: string;
  dateKey: string;
  timestamp: number;
  snapshot: HistoryState;
  label: string;
}

/** 添加/编辑列表单中选项项（单选/多选） */
export interface ColumnFormOptionItem {
  key: string;
  value: string;
}
