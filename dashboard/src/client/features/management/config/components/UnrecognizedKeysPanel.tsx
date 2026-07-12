import { memo } from "react";

export interface UnrecognizedKeysPanelProps {
  keys: readonly string[];
  values: Record<string, unknown>;
  testId?: string;
}

function UnrecognizedKeysPanelImpl({
  keys,
  values,
  testId = "unrecognized-keys",
}: UnrecognizedKeysPanelProps) {
  if (keys.length === 0) return null;

  return (
    <section className="hf-form-section" data-testid={testId}>
      <h3 className="hf-form-section__title">Unrecognized keys</h3>
      <p className="hf-replay__note" data-testid={`${testId}-copy`}>
        These keys are absent from the current schema. They are preserved
        verbatim on every save.
      </p>
      <pre className="hf-doc__raw" data-testid={`${testId}-json`}>
        {JSON.stringify(
          Object.fromEntries(keys.map((k) => [k, values[k]])),
          null,
          2,
        )}
      </pre>
    </section>
  );
}

export const UnrecognizedKeysPanel = memo(UnrecognizedKeysPanelImpl);
