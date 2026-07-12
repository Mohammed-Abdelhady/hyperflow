import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type UIEvent,
} from "react";
import { ROW_HEIGHT_DEFAULT } from "../constants/motion";

export interface VirtualListOptions {
  itemCount: number;
  rowHeight?: number;
  overscan?: number;
  viewportHeight: number;
  /** When true, stick to bottom on append until user scrolls up. */
  autoFollow?: boolean;
}

export interface VirtualListResult {
  startIndex: number;
  endIndex: number;
  offsetY: number;
  totalHeight: number;
  onScroll: (e: UIEvent<HTMLElement>) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  pinned: boolean;
  pinToBottom: () => void;
}

export function useVirtualList({
  itemCount,
  rowHeight = ROW_HEIGHT_DEFAULT,
  overscan = 5,
  viewportHeight,
  autoFollow = true,
}: VirtualListOptions): VirtualListResult {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [pinned, setPinned] = useState(true);

  const totalHeight = itemCount * rowHeight;

  const { startIndex, endIndex, offsetY } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visible = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    const end = Math.min(itemCount, start + visible);
    return {
      startIndex: start,
      endIndex: end,
      offsetY: start * rowHeight,
    };
  }, [scrollTop, rowHeight, overscan, viewportHeight, itemCount]);

  const pinToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setPinned(true);
  }, []);

  // Auto-follow: when pinned and items grow, jump instantly (no smooth scroll).
  const prevCount = useRef(itemCount);
  if (autoFollow && pinned && itemCount > prevCount.current) {
    queueMicrotask(() => pinToBottom());
  }
  prevCount.current = itemCount;

  const onScroll = useCallback(
    (e: UIEvent<HTMLElement>) => {
      const el = e.currentTarget;
      setScrollTop(el.scrollTop);
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom > rowHeight) {
        setPinned(false);
      } else {
        setPinned(true);
      }
    },
    [rowHeight],
  );

  return {
    startIndex,
    endIndex,
    offsetY,
    totalHeight,
    onScroll,
    scrollRef,
    pinned,
    pinToBottom,
  };
}
