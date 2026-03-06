import { useState, useRef, useCallback } from "react";

/**
 * TableCanvas 自绘滚动条与表格区域的 hover 状态：保持「悬停表格/滚动条时显示滚动条」的延时逻辑
 */
export function useTableCanvasScrollbarHover() {
  const [isHoveringTableArea, setIsHoveringTableArea] = useState(false);
  const hoverLeaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onScrollbarMouseEnter = useCallback(() => {
    if (hoverLeaveTimeoutRef.current) {
      clearTimeout(hoverLeaveTimeoutRef.current);
      hoverLeaveTimeoutRef.current = null;
    }
    setIsHoveringTableArea(true);
  }, []);

  const onScrollbarMouseLeave = useCallback(() => {
    hoverLeaveTimeoutRef.current = setTimeout(() => setIsHoveringTableArea(false), 150);
  }, []);

  return {
    isHoveringTableArea,
    setIsHoveringTableArea,
    hoverLeaveTimeoutRef,
    onScrollbarMouseEnter,
    onScrollbarMouseLeave,
  };
}
