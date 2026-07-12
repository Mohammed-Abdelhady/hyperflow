import { memo } from "react";

export type ConfigFieldKind = "boolean" | "number" | "string" | "enum" | "object";

export interface ConfigFieldProps {
  path: string[];
  label: string;
  kind: ConfigFieldKind;
  value: unknown;
  options?: readonly string[];
  error?: string;
  disabled?: boolean;
  onChange: (path: string[], value: unknown) => void;
  testId?: string;
}

function ConfigFieldImpl({
  path,
  label,
  kind,
  value,
  options,
  error,
  disabled = false,
  onChange,
  testId = "config-field",
}: ConfigFieldProps) {
  const id = path.join(".");

  return (
    <label className="hf-field" data-testid={`${testId}-${id}`}>
      <span className="hf-field__label">{label}</span>
      {kind === "boolean" ? (
        <input
          type="checkbox"
          className="hf-roster-row__check"
          checked={Boolean(value)}
          disabled={disabled}
          data-testid={`${testId}-${id}-input`}
          onChange={(e) => onChange(path, e.target.checked)}
        />
      ) : null}
      {kind === "number" ? (
        <input
          type="number"
          className="hf-field__input"
          value={typeof value === "number" ? value : ""}
          disabled={disabled}
          data-testid={`${testId}-${id}-input`}
          onChange={(e) =>
            onChange(path, e.target.value === "" ? undefined : Number(e.target.value))
          }
        />
      ) : null}
      {kind === "string" ? (
        <input
          type="text"
          className="hf-field__input"
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          data-testid={`${testId}-${id}-input`}
          onChange={(e) => onChange(path, e.target.value)}
        />
      ) : null}
      {kind === "enum" && options ? (
        <select
          className="hf-field__select"
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          data-testid={`${testId}-${id}-input`}
          onChange={(e) => onChange(path, e.target.value)}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : null}
      {error ? (
        <span className="hf-field__error" data-testid={`${testId}-${id}-error`}>
          {error}
        </span>
      ) : null}
    </label>
  );
}

export const ConfigField = memo(ConfigFieldImpl);
