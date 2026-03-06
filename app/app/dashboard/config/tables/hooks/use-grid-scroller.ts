"use client";

/**
 * 网格滚动 Hook - 移植自 APITable useGridScroller
 * 用于 split 布局下 Header/Body 分离滚动的状态同步
 * 参考: app/docs/apitable-table-porting-guide.md
 */

import { useState, useCallback, useRef } from "react";

export interface UseGridScrollerOptions {
  /** 行高 */
  cellHeight: number;
  /** 表头高度 */
  headerHeight: number;
  /** 添加行按钮高度 */
  addRowButtonHeight: number;
  /** 行数（用于计算最大滚动） */
  rowCount: number;
  /** 滚动时触发的回调（如清除菜单、hover 状态） */
  onScrollChange?: () => void;
  /** 滚动后触发的重绘回调 */
  onScroll?: () => void;
}

export interface UseGridScrollerResult {
  scrollX: number;
  scrollY: number;
  setScrollX: (v: number) => void;
  setScrollY: (v: number) => void;
  handleScrollX: (e: React.UIEvent<HTMLDivElement>) => void;
  handleScrollY: (e: React.UIEvent<HTMLDivElement>) => void;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  /** 计算内容总高度（split 布局时 body 不含表头） */
  getTotalBodyHeight: () => number;
  /** 计算最大纵向滚动值 */
  getMaxScrollY: (viewportHeight: number) => number;
}

export function useGridScroller({
  cellHeight,
  headerHeight,
  addRowButtonHeight,
  rowCount,
  onScrollChange,
  onScroll,
}: UseGridScrollerOptions): UseGridScrollerResult {
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const rafRef = useRef<number | null>(null);

  const scheduleRender = useCallback(() => {
    onScrollChange?.();
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      onScroll?.();
    });
  }, [onScrollChange, onScroll]);

  const getTotalBodyHeight = useCallback(() => {
    return rowCount * cellHeight + addRowButtonHeight;
  }, [rowCount, cellHeight, addRowButtonHeight]);

  const getMaxScrollY = useCallback(
    (viewportHeight: number) => {
      const totalBodyHeight = getTotalBodyHeight();
      return Math.max(0, totalBodyHeight - viewportHeight);
    },
    [getTotalBodyHeight]
  );

  const handleScrollX = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setScrollX(e.currentTarget.scrollLeft);
      scheduleRender();
    },
    [scheduleRender]
  );

  const handleScrollY = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      let newScrollY = target.scrollTop;
      const viewportHeight = target.clientHeight;
      const totalBodyHeight = getTotalBodyHeight();

      if (rowCount > 0) {
        const maxScrollY = getMaxScrollY(viewportHeight);
        if (totalBodyHeight <= viewportHeight) {
          newScrollY = 0;
          if (Math.abs(target.scrollTop) > 1) target.scrollTop = 0;
        } else {
          if (newScrollY > maxScrollY) {
            newScrollY = maxScrollY;
            if (Math.abs(target.scrollTop - maxScrollY) > 1) target.scrollTop = maxScrollY;
          }
          if (newScrollY < 0) {
            newScrollY = 0;
            if (Math.abs(target.scrollTop) > 1) target.scrollTop = 0;
          }
        }
      }
      setScrollY(newScrollY);
      scheduleRender();
    },
    [rowCount, getTotalBodyHeight, getMaxScrollY, scheduleRender]
  );

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const newScrollX = target.scrollLeft;
      let newScrollY = target.scrollTop;
      const viewportHeight = target.clientHeight;

      if (rowCount > 0) {
        const totalContentHeight = headerHeight + rowCount * cellHeight + addRowButtonHeight;
        const maxScrollY = Math.max(0, totalContentHeight - viewportHeight);

        if (totalContentHeight <= viewportHeight) {
          newScrollY = 0;
          if (Math.abs(target.scrollTop) > 1) target.scrollTop = 0;
        } else {
          if (newScrollY > maxScrollY) {
            newScrollY = maxScrollY;
            if (Math.abs(target.scrollTop - maxScrollY) > 1) target.scrollTop = maxScrollY;
          }
          if (newScrollY < 0) {
            newScrollY = 0;
            if (Math.abs(target.scrollTop) > 1) target.scrollTop = 0;
          }
        }
      } else {
        const maxScrollY = Math.max(0, headerHeight - viewportHeight);
        if (newScrollY > maxScrollY) {
          newScrollY = maxScrollY;
          if (Math.abs(target.scrollTop - maxScrollY) > 1) target.scrollTop = maxScrollY;
        }
      }

      setScrollX(newScrollX);
      setScrollY(newScrollY);
      scheduleRender();
    },
    [rowCount, headerHeight, cellHeight, addRowButtonHeight, scheduleRender]
  );

  return {
    scrollX,
    scrollY,
    setScrollX,
    setScrollY,
    handleScrollX,
    handleScrollY,
    handleScroll,
    getTotalBodyHeight,
    getMaxScrollY,
  };
}
