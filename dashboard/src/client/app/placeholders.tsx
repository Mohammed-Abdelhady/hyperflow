import { useSearchParams } from "react-router-dom";
import { SLUG_QUERY_KEY } from "../constants/routes";
import type { FeatureId } from "../constants/features";

export function SurfacePlaceholder({
  id,
  label,
}: {
  id: FeatureId;
  label: string;
}) {
  const [params] = useSearchParams();
  const slug = params.get(SLUG_QUERY_KEY);
  return (
    <div className="hf-placeholder" data-testid={`surface-${id}`}>
      <p data-testid={`surface-${id}-title`}>{label}</p>
      {slug ? (
        <p data-testid={`surface-${id}-slug`}>slug={slug}</p>
      ) : null}
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="hf-placeholder" data-testid="not-found">
      Route not found — open a surface from the sidebar.
    </div>
  );
}
