import { create } from "zustand";
import type {
  DrawerState,
  FeatureFilter,
  FeatureTabId,
  SelectionTarget,
} from "../types/ui";

export interface UiStoreState {
  selection: SelectionTarget;
  drawer: DrawerState;
  tabBySurface: Record<string, FeatureTabId>;
  filterBySurface: Record<string, FeatureFilter>;

  setSelection: (selection: SelectionTarget) => void;
  setDrawer: (drawer: DrawerState) => void;
  openDrawer: (surface?: string) => void;
  closeDrawer: () => void;
  setTab: (surface: string, tab: FeatureTabId) => void;
  setFilter: (surface: string, filter: FeatureFilter) => void;
  /** Intentionally no-op for data-slice isolation — resync must not clear UI. */
  preserveAcrossResync: () => void;
}

export function createUiStore() {
  return create<UiStoreState>((set, get) => ({
    selection: null,
    drawer: { open: false },
    tabBySurface: {},
    filterBySurface: {},

    setSelection: (selection) => set({ selection }),

    setDrawer: (drawer) => set({ drawer }),

    openDrawer: (surface) =>
      set({
        drawer: surface
          ? { open: true, surface }
          : { open: true },
      }),

    closeDrawer: () => set({ drawer: { open: false } }),

    setTab: (surface, tab) =>
      set({
        tabBySurface: { ...get().tabBySurface, [surface]: tab },
      }),

    setFilter: (surface, filter) =>
      set({
        filterBySurface: { ...get().filterBySurface, [surface]: filter },
      }),

    preserveAcrossResync: () => {
      /* UI slices survive resync by design — no mutation. */
    },
  }));
}

export type UiStore = ReturnType<typeof createUiStore>;

export const useUiStore = createUiStore();
