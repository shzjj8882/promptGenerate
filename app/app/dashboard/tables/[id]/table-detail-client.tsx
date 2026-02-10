"use client";

import { observer } from "mobx-react-lite";
import { TableEditor } from "../table-editor";
import type { MultiDimensionTable, TableRow as TableRowType } from "@/lib/api/multi-dimension-tables";

interface TableDetailClientProps {
  tableId: string;
  initialTable?: MultiDimensionTable;
  initialRows?: TableRowType[];
}

function TableDetailClientImpl({ tableId, initialTable, initialRows }: TableDetailClientProps) {
  const handleTableUpdated = () => {
    // 表格更新后可以刷新列表（如果需要）
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden min-h-0">
      <div className="flex-1 min-h-0 border rounded-lg overflow-hidden flex flex-col">
        <TableEditor
          tableId={tableId}
          onTableUpdated={handleTableUpdated}
          initialTable={initialTable}
          initialRows={initialRows}
        />
      </div>
    </div>
  );
}

export const TableDetailClient = observer(TableDetailClientImpl);
