import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { SLUG_QUERY_KEY } from "../../../constants/routes";

export interface PlanSelectionOptions {
  slugs: readonly string[];
}

/**
 * Syncs selected plan slug with `?slug=` query param.
 * Falls back to first available slug when param missing/invalid.
 */
export function usePlanSelection({ slugs }: PlanSelectionOptions) {
  const [params, setParams] = useSearchParams();
  const raw = params.get(SLUG_QUERY_KEY);

  const selectedSlug = useMemo(() => {
    if (raw && slugs.includes(raw)) return raw;
    return slugs[0] ?? null;
  }, [raw, slugs]);

  useEffect(() => {
    if (!selectedSlug) return;
    if (raw === selectedSlug) return;
    // Only rewrite when the URL has an invalid slug — never thrash when raw is null
    // (default selection is in-memory only until the user clicks).
    if (raw && !slugs.includes(raw)) {
      const next = new URLSearchParams(params);
      next.set(SLUG_QUERY_KEY, selectedSlug);
      setParams(next, { replace: true });
    }
    // Intentionally omit `params`/`slugs` identity from deps to avoid setParams loops.
  }, [raw, selectedSlug, setParams]);

  const select = useCallback(
    (slug: string) => {
      const next = new URLSearchParams(params);
      next.set(SLUG_QUERY_KEY, slug);
      setParams(next, { replace: false });
    },
    [params, setParams],
  );

  return { selectedSlug, select };
}
