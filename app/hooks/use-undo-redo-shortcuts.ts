"use client";

import { useEffect } from "react";

/**
 * 撤销/重做键盘快捷键 Hook
 * Ctrl+Z / Cmd+Z: 撤销
 * Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z: 重做
 * 在 INPUT、TEXTAREA、contentEditable 内不触发
 */
export function useUndoRedoShortcuts(options: {
  canUndo: boolean;
  canRedo: boolean;
  disabled?: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const { canUndo, canRedo, disabled = false, onUndo, onRedo } = options;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      if (disabled) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) onUndo();
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.key === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z")
      ) {
        e.preventDefault();
        if (canRedo) onRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, disabled, onUndo, onRedo]);
}
