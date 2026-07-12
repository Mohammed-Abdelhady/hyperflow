/** Client-only view types — wire/parse types come from shared/. */

export type SidebarSection = "observe" | "artefacts" | "graphs" | "manage";

export type BannerVariant =
  | "connection"
  | "resync"
  | "reduced-fidelity"
  | "observe-mode";

export interface BannerModel {
  variant: BannerVariant;
  message: string;
  actionLabel?: string;
  actionTestId?: string;
}

export type ConnectionStreamStatus =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "resyncing"
  | "dead"
  | "unauthenticated";

export type FidelityMode = "full" | "reduced";

export type SelectionTarget = {
  surface: string;
  id: string;
} | null;

export type DrawerState = {
  open: boolean;
  surface?: string;
};

export type FeatureTabId = string;
export type FeatureFilter = Record<string, string | boolean | null>;
