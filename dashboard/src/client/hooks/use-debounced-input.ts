import { useEffect, useState } from "react";
import { INPUT_DEBOUNCE_MS } from "../constants/store";

export interface DebouncedInput {
  value: string;
  debounced: string;
  setValue: (next: string) => void;
}

export function useDebouncedInput(
  initial = "",
  delayMs: number = INPUT_DEBOUNCE_MS,
): DebouncedInput {
  const [value, setValue] = useState(initial);
  const [debounced, setDebounced] = useState(initial);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return { value, debounced, setValue };
}
