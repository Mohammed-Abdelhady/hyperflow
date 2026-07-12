import { useCallback, useEffect, useMemo, useState } from "react";
import {
  parseConfigWrite,
  type ConfigWrite,
} from "@shared/schemas/index.js";

export interface ConfigFormState {
  values: ConfigWrite;
  dirty: boolean;
  rawMode: boolean;
  rawText: string;
  fieldErrors: Record<string, string>;
  rawError: string | null;
}

function cloneConfig(c: ConfigWrite): ConfigWrite {
  return JSON.parse(JSON.stringify(c)) as ConfigWrite;
}

export function useConfigFormState(initial: ConfigWrite) {
  const [values, setValues] = useState<ConfigWrite>(() => cloneConfig(initial));
  const [baseline, setBaseline] = useState<ConfigWrite>(() =>
    cloneConfig(initial),
  );
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState(() =>
    JSON.stringify(initial, null, 2),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [rawError, setRawError] = useState<string | null>(null);

  useEffect(() => {
    setValues(cloneConfig(initial));
    setBaseline(cloneConfig(initial));
    setRawText(JSON.stringify(initial, null, 2));
    setFieldErrors({});
    setRawError(null);
  }, [initial]);

  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(baseline),
    [values, baseline],
  );

  const setField = useCallback((path: string[], value: unknown) => {
    setValues((prev) => {
      const next = cloneConfig(prev) as Record<string, unknown>;
      let cursor: Record<string, unknown> = next;
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!key) continue;
        const child = cursor[key];
        if (typeof child !== "object" || child === null) {
          cursor[key] = {};
        }
        cursor = cursor[key] as Record<string, unknown>;
      }
      const last = path[path.length - 1];
      if (last) cursor[last] = value;
      return next as ConfigWrite;
    });
  }, []);

  const enterRaw = useCallback(() => {
    setRawText(JSON.stringify(values, null, 2));
    setRawMode(true);
    setRawError(null);
  }, [values]);

  const leaveRaw = useCallback(() => {
    try {
      const parsed: unknown = JSON.parse(rawText);
      const result = parseConfigWrite(parsed);
      if (!result.success) {
        setRawError(result.error.issues[0]?.message ?? "Invalid config");
        return false;
      }
      setValues(result.data);
      setRawMode(false);
      setRawError(null);
      return true;
    } catch {
      setRawError("Malformed JSON");
      return false;
    }
  }, [rawText]);

  const validate = useCallback((): boolean => {
    if (rawMode) {
      try {
        const parsed: unknown = JSON.parse(rawText);
        const result = parseConfigWrite(parsed);
        if (!result.success) {
          setRawError(result.error.issues[0]?.message ?? "Invalid config");
          return false;
        }
        setValues(result.data);
        setRawError(null);
        return true;
      } catch {
        setRawError("Malformed JSON");
        return false;
      }
    }
    const result = parseConfigWrite(values);
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".") || "root";
        errs[key] = issue.message;
      }
      setFieldErrors(errs);
      return false;
    }
    setFieldErrors({});
    return true;
  }, [rawMode, rawText, values]);

  const markSaved = useCallback((next: ConfigWrite) => {
    setBaseline(cloneConfig(next));
    setValues(cloneConfig(next));
    setRawText(JSON.stringify(next, null, 2));
  }, []);

  return {
    values,
    dirty,
    rawMode,
    rawText,
    setRawText,
    fieldErrors,
    rawError,
    setField,
    enterRaw,
    leaveRaw,
    validate,
    markSaved,
    setRawMode,
  };
}
