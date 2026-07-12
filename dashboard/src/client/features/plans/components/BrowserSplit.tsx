import { memo, type CSSProperties, type ReactNode } from "react";
import { BROWSER_RAIL_WIDTH_PX } from "../../../constants/motion";

export interface BrowserSplitProps {
  rail: ReactNode;
  pane: ReactNode;
  /** Optional header above the document pane (breadcrumbs, toggles). */
  header?: ReactNode;
  testId?: string;
}

function BrowserSplitImpl({
  rail,
  pane,
  header,
  testId = "browser-split",
}: BrowserSplitProps) {
  const style = {
    ["--browser-rail-width"]: `${BROWSER_RAIL_WIDTH_PX}px`,
  } as CSSProperties;

  return (
    <div className="hf-browser-split" data-testid={testId} style={style}>
      <aside className="hf-browser-split__rail" data-testid={`${testId}-rail`}>
        {rail}
      </aside>
      <section className="hf-browser-split__pane" data-testid={`${testId}-pane`}>
        {header ? (
          <div
            className="hf-browser-split__header"
            data-testid={`${testId}-header`}
          >
            {header}
          </div>
        ) : null}
        {pane}
      </section>
    </div>
  );
}

export const BrowserSplit = memo(BrowserSplitImpl);
