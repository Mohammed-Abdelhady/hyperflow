import { memo } from "react";

export interface RawJsonEditorProps {
  value: string;
  error: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
  testId?: string;
}

function RawJsonEditorImpl({
  value,
  error,
  disabled = false,
  onChange,
  testId = "raw-json-editor",
}: RawJsonEditorProps) {
  return (
    <div className="hf-form-section" data-testid={testId}>
      <h3 className="hf-form-section__title">Raw JSON</h3>
      <textarea
        className="hf-field__textarea"
        rows={16}
        value={value}
        disabled={disabled}
        data-testid={`${testId}-textarea`}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      {error ? (
        <p className="hf-field__error" data-testid={`${testId}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const RawJsonEditor = memo(RawJsonEditorImpl);
