import { memo } from "react";
import type { ParseFailureRef } from "@shared/derived/index.js";
import { Link } from "react-router-dom";
import { ROUTES } from "../../../constants/routes";

export interface ParseFailureListProps {
  failures: readonly ParseFailureRef[];
  testId?: string;
}

function rawHref(path: string): string {
  // Prefer plans/features/audits by path prefix; fall back to plans browser.
  if (path.includes("/audits/")) {
    return `${ROUTES.AUDITS}?slug=${encodeURIComponent(path)}`;
  }
  if (path.includes("/features/")) {
    return `${ROUTES.FEATURES}?slug=${encodeURIComponent(path)}`;
  }
  if (path.includes("/memory/")) {
    return `${ROUTES.MEMORY}?slug=${encodeURIComponent(path)}`;
  }
  return `${ROUTES.PLANS}?slug=${encodeURIComponent(path)}`;
}

function ParseFailureListImpl({
  failures,
  testId = "health-parse-failures",
}: ParseFailureListProps) {
  if (failures.length === 0) return null;
  return (
    <div data-testid={testId}>
      <h3 className="hf-chart-card__title">Parse failures</h3>
      <ul className="hf-parse-fail-list">
        {failures.map((f) => (
          <li key={f.path}>
            <Link
              to={rawHref(f.path)}
              data-testid={`${testId}-link-${f.path}`}
            >
              {f.path}
              {f.reason ? ` — ${f.reason}` : ""}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const ParseFailureList = memo(ParseFailureListImpl);
