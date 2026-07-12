import { memo } from "react";
import type { AuditFinding } from "@shared/schemas/index.js";
import {
  normalizeSeverity,
  SEVERITY_DOT_COLOR,
} from "../utils/severity";

export interface FindingRowProps {
  finding: AuditFinding;
  testId?: string;
}

function FindingRowImpl({
  finding,
  testId = "finding-row",
}: FindingRowProps) {
  const severity = normalizeSeverity(finding.severity);
  const ref =
    finding.file !== undefined
      ? `${finding.file}${finding.line !== undefined ? `:${finding.line}` : ""}`
      : "";

  return (
    <div className="hf-finding-row" data-testid={testId} title={finding.issue ?? finding.title}>
      <span
        className="hf-severity-dot"
        style={{ background: SEVERITY_DOT_COLOR[severity] }}
        data-testid={`${testId}-severity`}
        data-severity={severity}
        aria-label={severity}
      />
      <span className="hf-finding-row__title" data-testid={`${testId}-title`}>
        {finding.title}
      </span>
      <span className="hf-roster-row__meta" data-testid={`${testId}-ref`}>
        {ref}
      </span>
    </div>
  );
}

export const FindingRow = memo(FindingRowImpl);
