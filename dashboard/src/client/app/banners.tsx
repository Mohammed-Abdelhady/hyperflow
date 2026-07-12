import type { BannerModel } from "../types/ui";

export interface BannersProps {
  banners: BannerModel[];
  onAction?: (variant: BannerModel["variant"]) => void;
}

export function Banners({ banners, onAction }: BannersProps) {
  if (banners.length === 0) return null;
  return (
    <div className="hf-banners" data-testid="banner-stack" role="status">
      {banners.map((b) => (
        <div
          key={b.variant}
          className={`hf-banner hf-banner--${b.variant}`}
          data-testid={`banner-${b.variant}`}
        >
          <span data-testid={`banner-${b.variant}-label`}>{b.message}</span>
          {b.actionLabel ? (
            <button
              type="button"
              className="hf-banner__action"
              data-testid={b.actionTestId ?? `banner-${b.variant}-action`}
              onClick={() => onAction?.(b.variant)}
            >
              {b.actionLabel}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Derive banner models from connection slice — pure helper, no JSX logic. */
export function deriveBanners(input: {
  streamStatus: string;
  resyncInProgress: boolean;
  fidelity: string;
  observeMode: boolean;
}): BannerModel[] {
  const out: BannerModel[] = [];

  if (
    input.streamStatus === "dead" ||
    input.streamStatus === "reconnecting"
  ) {
    out.push({
      variant: "connection",
      message:
        input.streamStatus === "reconnecting"
          ? "Stream reconnecting — resuming from last event"
          : "Stream disconnected — waiting to resume",
      actionLabel: "Retry",
      actionTestId: "banner-connection-retry",
    });
  }

  if (input.resyncInProgress || input.streamStatus === "resyncing") {
    out.push({
      variant: "resync",
      message: "Resync in progress — reloading snapshot",
    });
  }

  if (input.fidelity === "reduced") {
    out.push({
      variant: "reduced-fidelity",
      message: "Reduced fidelity — events.ndjson absent; markdown-only mode",
    });
  }

  if (input.observeMode) {
    out.push({
      variant: "observe-mode",
      message: "Observe mode — filesystem is read-only; writes disabled",
    });
  }

  return out;
}
