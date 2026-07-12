import { memo, useMemo } from "react";
import type { ConfigWrite } from "@shared/schemas/index.js";
import { useConfigFormState } from "../hooks/useConfigFormState";
import { useConfigMutation } from "../hooks/useConfigMutation";
import { useConfigQuery } from "../hooks/useConfigQuery";
import { ConfigForm } from "./ConfigForm";
import { RawJsonEditor } from "./RawJsonEditor";
import { UnrecognizedKeysPanel } from "./UnrecognizedKeysPanel";

export interface ConfigEditorProps {
  /** Observe mode disables all writes. */
  observeMode?: boolean;
  testId?: string;
}

function ConfigEditorImpl({
  observeMode = false,
  testId = "config-editor",
}: ConfigEditorProps) {
  const query = useConfigQuery();
  const initial = useMemo(
    () => query.known as ConfigWrite,
    [query.known],
  );
  const form = useConfigFormState(initial);
  const mutation = useConfigMutation();

  const disabled = observeMode || mutation.state.phase === "saving";

  return (
    <div className="hf-mgmt-section" data-testid={testId}>
      <div className="hf-browser-split__header">
        <h2 className="hf-doc__title">Config</h2>
        <div className="hf-diff__controls">
          {form.dirty ? (
            <span className="hf-pending" data-testid={`${testId}-dirty`}>
              Unsaved changes
            </span>
          ) : null}
          {mutation.state.phase === "pending-echo" ? (
            <span className="hf-pending" data-testid={`${testId}-pending`}>
              Awaiting write-echo…
            </span>
          ) : null}
          {mutation.state.phase === "saved" ? (
            <span className="hf-pending" data-testid={`${testId}-saved`}>
              Saved
            </span>
          ) : null}
          <button
            type="button"
            className="hf-btn"
            data-testid={`${testId}-raw-toggle`}
            disabled={disabled}
            onClick={() => {
              if (form.rawMode) form.leaveRaw();
              else form.enterRaw();
            }}
            title={observeMode ? "Observe mode — writes disabled" : undefined}
          >
            {form.rawMode ? "Form mode" : "Advanced raw JSON"}
          </button>
          <button
            type="button"
            className="hf-btn hf-btn--primary"
            data-testid={`${testId}-save`}
            disabled={disabled || (!form.dirty && !form.rawMode)}
            title={observeMode ? "Observe mode — writes disabled" : undefined}
            onClick={() => {
              if (!form.validate()) return;
              void mutation.save({
                known: form.values,
                unrecognized: query.unrecognized,
                ...(query.mtimeMs !== null
                  ? { expectedMtimeMs: query.mtimeMs }
                  : {}),
              });
              form.markSaved(form.values);
            }}
          >
            Save
          </button>
        </div>
      </div>
      {mutation.state.errorMessage ? (
        <p className="hf-error-inline" data-testid={`${testId}-error`}>
          {mutation.state.errorMessage}
        </p>
      ) : null}
      {mutation.state.promptReapply ? (
        <p className="hf-error-inline" data-testid={`${testId}-conflict`}>
          Config changed on disk — refreshed. Reapply your edits and save.
        </p>
      ) : null}
      {form.rawMode ? (
        <RawJsonEditor
          value={form.rawText}
          error={form.rawError}
          disabled={disabled}
          onChange={form.setRawText}
        />
      ) : (
        <ConfigForm
          values={form.values}
          fieldErrors={form.fieldErrors}
          disabled={disabled}
          onChange={form.setField}
        />
      )}
      <UnrecognizedKeysPanel
        keys={query.unrecognizedKeys}
        values={query.unrecognized}
      />
    </div>
  );
}

export const ConfigEditor = memo(ConfigEditorImpl);
