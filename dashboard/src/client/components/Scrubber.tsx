import { animate } from "motion/react";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { SPRING_SETTLE } from "../constants/motion";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import {
  clamp01,
  indexToProgress,
  nearestBoundaryIndex,
  pointerToProgress,
  stepDeltaFromKey,
} from "../utils/chainline-geometry";

export interface ScrubberProps {
  position: number;
  eventCount: number;
  stageCount?: number | undefined;
  onPositionChange?: ((position: number) => void) | undefined;
  onScrubbingChange?: ((scrubbing: boolean) => void) | undefined;
  onEventStep?: ((delta: number) => void) | undefined;
  onStageStep?: ((delta: number) => void) | undefined;
  testId?: string | undefined;
}

function ScrubberImpl({
  position,
  eventCount,
  stageCount = 0,
  onPositionChange,
  onScrubbingChange,
  onEventStep,
  onStageStep,
  testId = "scrubber",
}: ScrubberProps) {
  const reduced = useReducedMotion();
  const railRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLButtonElement>(null);
  const dragging = useRef(false);
  const posRef = useRef(position);

  useEffect(() => {
    if (!dragging.current) posRef.current = position;
  }, [position]);

  const isRtl = () =>
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("dir") === "rtl";

  const setPos = useCallback(
    (p: number) => {
      const next = clamp01(p);
      posRef.current = next;
      onPositionChange?.(next);
      if (playheadRef.current) {
        playheadRef.current.style.insetInlineStart = `${next * 100}%`;
      }
    },
    [onPositionChange],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (!rail) return;
    dragging.current = true;
    onScrubbingChange?.(true);
    document.documentElement.dataset.scrubbing = "true";
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = rail.getBoundingClientRect();
    setPos(pointerToProgress(e.clientX, rect, isRtl()));
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !railRef.current) return;
    const rect = railRef.current.getBoundingClientRect();
    setPos(pointerToProgress(e.clientX, rect, isRtl()));
  };

  const settle = useCallback(() => {
    const boundary = nearestBoundaryIndex(posRef.current, eventCount);
    const target = indexToProgress(boundary, eventCount);
    if (reduced) {
      setPos(target);
      return;
    }
    const from = posRef.current;
    animate(from, target, {
      ...SPRING_SETTLE,
      onUpdate: (v) => setPos(v),
    });
  }, [eventCount, reduced, setPos]);

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    onScrubbingChange?.(false);
    delete document.documentElement.dataset.scrubbing;
    settle();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const delta = stepDeltaFromKey(e.key, isRtl());
    if (delta === null) return;
    e.preventDefault();
    if (e.shiftKey && stageCount > 0) {
      onStageStep?.(delta);
      return;
    }
    onEventStep?.(delta);
    const nextIndex = nearestBoundaryIndex(posRef.current, eventCount) + delta;
    setPos(indexToProgress(nextIndex, eventCount));
  };

  const ticks = Array.from({ length: eventCount }, (_, i) =>
    indexToProgress(i, eventCount),
  );

  return (
    <div
      className="hf-scrubber"
      data-testid={testId}
      ref={railRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="hf-scrubber__rail" data-testid={`${testId}-rail`}>
        <div
          className="hf-scrubber__fill"
          style={{ transform: `scaleX(${position})` }}
          data-testid={`${testId}-fill`}
        />
      </div>
      {ticks.map((t, i) => (
        <span
          key={i}
          className="hf-scrubber__tick"
          style={{ insetInlineStart: `${t * 100}%` }}
          aria-hidden
        />
      ))}
      <button
        type="button"
        ref={playheadRef}
        className="hf-scrubber__playhead"
        data-testid={`${testId}-playhead`}
        style={{ insetInlineStart: `${position * 100}%` }}
        aria-label="Timeline playhead"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position * 100)}
        role="slider"
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

export const Scrubber = memo(ScrubberImpl);
