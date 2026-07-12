import { animate } from "motion/react";
import {
  memo,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { SPRING_INSTRUMENT } from "../constants/motion";
import { useFocusContainment } from "../hooks/use-focus-containment";
import { useReducedMotion } from "../hooks/use-reduced-motion";

export interface InspectorPanelProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  onClose?: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  testId?: string;
}

function InspectorPanelImpl({
  open,
  title,
  children,
  onClose,
  returnFocusRef,
  testId = "inspector-panel",
}: InspectorPanelProps) {
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  useFocusContainment(panelRef, open, returnFocusRef);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;

    const rtl =
      document.documentElement.getAttribute("dir") === "rtl";
    // Docked at inline-end: closed state is off-screen toward end edge.
    const hiddenX = rtl ? "-100%" : "100%";

    if (reduced) {
      el.style.transform = open ? "translateX(0)" : `translateX(${hiddenX})`;
      el.style.visibility = open ? "visible" : "hidden";
      return;
    }

    if (open) {
      el.style.visibility = "visible";
      el.style.willChange = "transform";
      animate(
        el,
        { x: ["100%", "0%"] },
        {
          ...SPRING_INSTRUMENT,
          onComplete: () => {
            el.style.willChange = "auto";
          },
        },
      );
    } else {
      el.style.willChange = "transform";
      animate(
        el,
        { x: "100%" },
        {
          ...SPRING_INSTRUMENT,
          onComplete: () => {
            el.style.willChange = "auto";
            el.style.visibility = "hidden";
          },
        },
      );
    }
  }, [open, reduced]);

  return (
    <aside
      ref={panelRef}
      className="hf-inspector"
      data-testid={testId}
      data-open={open ? "true" : "false"}
      aria-hidden={!open}
      style={{
        transform: open ? "translateX(0)" : "translateX(100%)",
        visibility: open ? "visible" : "hidden",
      }}
    >
      <header className="hf-inspector__header" data-testid={`${testId}-header`}>
        <span>{title}</span>
        <button
          type="button"
          className="hf-inspector__close"
          data-testid={`${testId}-close`}
          aria-label="Close inspector"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <div className="hf-inspector__body" data-testid={`${testId}-body`}>
        {children}
      </div>
    </aside>
  );
}

export const InspectorPanel = memo(InspectorPanelImpl);
