"use client";

import { useState, useCallback, useRef } from "react";
import type { MultiDimensionTable } from "@/lib/api/multi-dimension-tables";
import type { TableRow as TableRowType, TableColumn } from "@/lib/api/multi-dimension-tables";
import type { HistoryState, HistoryStepType, CompletedHistoryEntry } from "../table-editor-types";

export type RecordHistoryOptions = {
  stepLabel?: string;
  stepType?: HistoryStepType;
  stepTitle?: string;
  stepDescription?: string;
};

export interface UseTableEditorHistoryParams {
  table: MultiDimensionTable | null;
  setTable: React.Dispatch<React.SetStateAction<MultiDimensionTable | null>>;
  setLocalRows: React.Dispatch<React.SetStateAction<TableRowType[]>>;
  setHasUnsavedChanges: (value: boolean) => void;
  /** 回滚时调用，例如关闭历史侧栏 */
  onRollback?: () => void;
}

export function useTableEditorHistory({
  table,
  setTable,
  setLocalRows,
  setHasUnsavedChanges,
  onRollback,
}: UseTableEditorHistoryParams) {
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const historyIndexRef = useRef<number>(-1);
  const rollbackTargetRef = useRef<number | null>(null);
  const [isUndoRedo, setIsUndoRedo] = useState(false);
  const historyInitializedRef = useRef<boolean>(false);

  const recordHistory = useCallback(
    (rows: TableRowType[], columns: TableColumn[], options?: RecordHistoryOptions) => {
      if (isUndoRedo) return;
      if (!historyInitializedRef.current) return;
      const { stepLabel, stepType, stepTitle, stepDescription } = options ?? {};

      const rollbackTarget = rollbackTargetRef.current;
      if (rollbackTarget !== null) rollbackTargetRef.current = null;

      const newState: HistoryState = {
        rows: JSON.parse(JSON.stringify(rows)),
        columns: JSON.parse(JSON.stringify(columns)),
        stepLabel,
        stepType,
        stepTitle,
        stepDescription,
      };

      setHistory((prev) => {
        const currentIndex = rollbackTarget !== null ? rollbackTarget : historyIndexRef.current;
        if (prev.length === 0) {
          const newHistory = [newState];
          const newIndex = 0;
          setHistoryIndex(newIndex);
          historyIndexRef.current = newIndex;
          return newHistory;
        }
        const newHistory = prev.slice(0, currentIndex + 1);
        newHistory.push(newState);
        if (newHistory.length > 50) newHistory.shift();
        const newIndex = newHistory.length - 1;
        setHistoryIndex(newIndex);
        historyIndexRef.current = newIndex;
        return newHistory;
      });
    },
    [isUndoRedo]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0 || !table) return;
    setIsUndoRedo(true);
    const prevIndex = historyIndex - 1;
    const prevState = history[prevIndex];
    if (prevState) {
      setLocalRows(prevState.rows);
      setTable((prev) => (prev ? { ...prev, columns: prevState.columns } : prev));
      setHistoryIndex(prevIndex);
      historyIndexRef.current = prevIndex;
      setHasUnsavedChanges(prevIndex !== 0);
    }
    setTimeout(() => setIsUndoRedo(false), 0);
  }, [historyIndex, history, table, setTable, setLocalRows, setHasUnsavedChanges]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1 || !table) return;
    setIsUndoRedo(true);
    const nextIndex = historyIndex + 1;
    const nextState = history[nextIndex];
    if (nextState) {
      setLocalRows(nextState.rows);
      setTable((prev) => (prev ? { ...prev, columns: nextState.columns } : prev));
      setHistoryIndex(nextIndex);
      historyIndexRef.current = nextIndex;
      setHasUnsavedChanges(true);
    }
    setTimeout(() => setIsUndoRedo(false), 0);
  }, [historyIndex, history.length, history, table, setTable, setLocalRows, setHasUnsavedChanges]);

  const handleRollbackToHistoryIndex = useCallback(
    (index: number) => {
      if (!table || index < 0 || index >= history.length) return;
      const state = history[index];
      if (!state) return;
      setIsUndoRedo(true);
      setLocalRows(state.rows);
      setTable((prev) => (prev ? { ...prev, columns: state.columns } : prev));
      setHistoryIndex(index);
      historyIndexRef.current = index;
      rollbackTargetRef.current = index;
      setHasUnsavedChanges(index !== 0);
      onRollback?.();
      setTimeout(() => setIsUndoRedo(false), 0);
    },
    [history, table, setTable, setLocalRows, setHasUnsavedChanges, onRollback]
  );

  const handleRollbackToCompleted = useCallback(
    (entry: CompletedHistoryEntry) => {
      if (!table) return;
      const { snapshot } = entry;
      setLocalRows(snapshot.rows);
      setTable((prev) => (prev ? { ...prev, columns: snapshot.columns } : prev));
      setHistory([{ ...snapshot }]);
      setHistoryIndex(0);
      historyIndexRef.current = 0;
      historyInitializedRef.current = true;
      setHasUnsavedChanges(true);
      onRollback?.();
    },
    [table, setTable, setLocalRows, setHasUnsavedChanges, onRollback]
  );

  const initializeHistory = useCallback((rows: TableRowType[], columns: TableColumn[]) => {
    const initialState: HistoryState = {
      rows: JSON.parse(JSON.stringify(rows)),
      columns: JSON.parse(JSON.stringify(columns)),
      stepLabel: "初始状态",
      stepType: "initial",
      stepTitle: "初始状态",
      stepDescription: "表格加载时的状态",
    };
    setHistory([initialState]);
    setHistoryIndex(0);
    historyIndexRef.current = 0;
    historyInitializedRef.current = true;
  }, []);

  return {
    history,
    setHistory,
    historyIndex,
    setHistoryIndex,
    historyIndexRef,
    rollbackTargetRef,
    historyInitializedRef,
    isUndoRedo,
    setIsUndoRedo,
    recordHistory,
    handleUndo,
    handleRedo,
    handleRollbackToHistoryIndex,
    handleRollbackToCompleted,
    initializeHistory,
  };
}
