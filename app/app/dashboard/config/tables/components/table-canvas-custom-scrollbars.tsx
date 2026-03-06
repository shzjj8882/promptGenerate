"use client";

/**
 * TableCanvas 自绘纵向/横向滚动条（hover 表格区域时显示，独立于 react-custom-scrollbars-4）
 */
import { SCROLLBAR_SIZE } from "./table-canvas-constants";

export interface TableCanvasVerticalScrollbarProps {
  thumbHeight: number;
  thumbTop: number;
  scrollY: number;
  maxScroll: number;
  onTrackMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onThumbMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onTrackTouchStart?: (e: React.TouchEvent<HTMLDivElement>) => void;
  onThumbTouchStart?: (e: React.TouchEvent<HTMLDivElement>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** 顶部留白（如表头高度），滚动条从该位置开始 */
  topOffset?: number;
  bottomOffset?: number;
  rightOffset?: number;
}

export function TableCanvasVerticalScrollbar({
  thumbHeight,
  thumbTop,
  scrollY,
  maxScroll,
  onTrackMouseDown,
  onThumbMouseDown,
  onTrackTouchStart,
  onThumbTouchStart,
  onMouseEnter,
  onMouseLeave,
  topOffset = 0,
  bottomOffset = 0,
  rightOffset = 0,
}: TableCanvasVerticalScrollbarProps) {
  return (
    <div
      className="absolute top-0 right-0 bottom-0 z-40 flex flex-col pointer-events-none"
      style={{
        width: SCROLLBAR_SIZE,
        top: topOffset,
        bottom: bottomOffset,
        right: rightOffset,
      }}
    >
      <div
        className="flex-1 min-h-0 w-3 bg-muted/30 rounded cursor-pointer pointer-events-auto flex flex-col items-center"
        style={{ minHeight: 24 }}
        onMouseDown={onTrackMouseDown}
        onTouchStart={onTrackTouchStart}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        role="scrollbar"
        aria-valuenow={scrollY}
        aria-valuemin={0}
        aria-valuemax={maxScroll}
      >
        <div
          className="w-2 bg-muted-foreground/40 hover:bg-muted-foreground/60 rounded cursor-grab active:cursor-grabbing shrink-0 pointer-events-auto"
          style={{
            height: thumbHeight,
            transform: `translateY(${thumbTop}px)`,
            minHeight: 24,
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          onMouseDown={onThumbMouseDown}
          onTouchStart={onThumbTouchStart}
        />
      </div>
    </div>
  );
}

export interface TableCanvasHorizontalScrollbarProps {
  thumbWidth: number;
  thumbLeft: number;
  scrollX: number;
  maxScroll: number;
  onTrackMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onThumbMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onTrackTouchStart?: (e: React.TouchEvent<HTMLDivElement>) => void;
  onThumbTouchStart?: (e: React.TouchEvent<HTMLDivElement>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  rightOffset?: number;
}

export function TableCanvasHorizontalScrollbar({
  thumbWidth,
  thumbLeft,
  scrollX,
  maxScroll,
  onTrackMouseDown,
  onThumbMouseDown,
  onTrackTouchStart,
  onThumbTouchStart,
  onMouseEnter,
  onMouseLeave,
  rightOffset = 0,
}: TableCanvasHorizontalScrollbarProps) {
  return (
    <div
      className="absolute left-0 right-0 bottom-0 z-40 flex items-center pointer-events-none"
      style={{
        height: SCROLLBAR_SIZE,
        right: rightOffset,
      }}
    >
      <div
        className="flex-1 h-3 bg-muted/30 rounded cursor-pointer pointer-events-auto flex items-center"
        style={{ minHeight: 12 }}
        onMouseDown={onTrackMouseDown}
        onTouchStart={onTrackTouchStart}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        role="scrollbar"
        aria-valuenow={scrollX}
        aria-valuemin={0}
        aria-valuemax={maxScroll}
      >
        <div
          className="h-2 bg-muted-foreground/40 hover:bg-muted-foreground/60 rounded cursor-grab active:cursor-grabbing shrink-0 pointer-events-auto"
          style={{
            width: thumbWidth,
            transform: `translateX(${thumbLeft}px)`,
            minWidth: 24,
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          onMouseDown={onThumbMouseDown}
          onTouchStart={onThumbTouchStart}
        />
      </div>
    </div>
  );
}
