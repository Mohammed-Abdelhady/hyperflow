import { memo, useState, type ReactNode } from "react";

export interface BottomStreamSlotProps {
  children?: ReactNode;
  defaultCollapsed?: boolean;
  testId?: string;
}

function BottomStreamSlotImpl({
  children,
  defaultCollapsed = false,
  testId = "mission-stream",
}: BottomStreamSlotProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section
      className="hf-cockpit__stream"
      data-testid={testId}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className="hf-cockpit__stream-header">
        <span
          style={{
            fontFamily: "var(--type-micro-family)",
            fontSize: "var(--type-micro-size)",
            letterSpacing: "var(--type-micro-tracking)",
            textTransform: "uppercase" as const,
            color: "var(--text-dim)",
          }}
        >
          Event stream
        </span>
        <button
          type="button"
          className="hf-stream-follow"
          data-testid={`${testId}-toggle`}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>
      <div className="hf-cockpit__stream-body" data-testid={`${testId}-body`}>
        {children ?? (
          <p
            className="hf-replay__note"
            style={{ padding: "var(--sp-3)" }}
            data-testid={`${testId}-placeholder`}
          >
            Stream idle.
          </p>
        )}
      </div>
    </section>
  );
}

export const BottomStreamSlot = memo(BottomStreamSlotImpl);
