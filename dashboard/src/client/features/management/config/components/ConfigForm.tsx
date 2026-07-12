import { memo } from "react";
import type { ConfigWrite } from "@shared/schemas/index.js";
import { ConfigField } from "./ConfigField";

export interface ConfigFormProps {
  values: ConfigWrite;
  fieldErrors: Record<string, string>;
  disabled?: boolean;
  onChange: (path: string[], value: unknown) => void;
  testId?: string;
}

interface FieldDef {
  path: string[];
  label: string;
  kind: "boolean" | "number" | "string";
  section: string;
}

/** Schema-derived field walk — mirrors shared/schemas/config.ts keys 1:1. */
export const CONFIG_FIELD_DEFS: readonly FieldDef[] = [
  { path: ["security", "enabled"], label: "Security enabled", kind: "boolean", section: "security" },
  { path: ["memory", "compactionThreshold"], label: "Compaction threshold", kind: "number", section: "memory" },
  { path: ["context", "windowTokens"], label: "Window tokens", kind: "number", section: "context" },
  {
    path: ["context", "autoCompactMinPercent"],
    label: "Auto-compact min %",
    kind: "number",
    section: "context",
  },
  {
    path: ["context", "autoCompactReadyTtlMinutes"],
    label: "Auto-compact ready TTL (min)",
    kind: "number",
    section: "context",
  },
  { path: ["handoff", "autoPush"], label: "Handoff auto-push", kind: "boolean", section: "handoff" },
  { path: ["handoff", "remote"], label: "Handoff remote", kind: "string", section: "handoff" },
  { path: ["handoff", "packageDir"], label: "Package dir", kind: "string", section: "handoff" },
  {
    path: ["specialists", "brain", "enabled"],
    label: "Brain specialist",
    kind: "boolean",
    section: "specialists",
  },
  {
    path: ["specialists", "webResearch", "enabled"],
    label: "Web research",
    kind: "boolean",
    section: "specialists",
  },
  {
    path: ["specialists", "webResearch", "maxSources"],
    label: "Max sources",
    kind: "number",
    section: "specialists",
  },
  {
    path: ["specialists", "webResearch", "recencyMonths"],
    label: "Recency months",
    kind: "number",
    section: "specialists",
  },
  {
    path: ["specialists", "webResearch", "offlineSkip"],
    label: "Offline skip",
    kind: "boolean",
    section: "specialists",
  },
] as const;

function readPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function ConfigFormImpl({
  values,
  fieldErrors,
  disabled = false,
  onChange,
  testId = "config-form",
}: ConfigFormProps) {
  const sections = [...new Set(CONFIG_FIELD_DEFS.map((f) => f.section))];

  return (
    <div data-testid={testId}>
      {sections.map((section) => (
        <section
          key={section}
          className="hf-form-section"
          data-testid={`${testId}-section-${section}`}
        >
          <h3 className="hf-form-section__title">{section}</h3>
          {CONFIG_FIELD_DEFS.filter((f) => f.section === section).map((f) => {
            const key = f.path.join(".");
            const err = fieldErrors[key];
            return (
              <ConfigField
                key={key}
                path={f.path}
                label={f.label}
                kind={f.kind}
                value={readPath(values, f.path)}
                {...(err !== undefined ? { error: err } : {})}
                disabled={disabled}
                onChange={onChange}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}

export const ConfigForm = memo(ConfigFormImpl);
