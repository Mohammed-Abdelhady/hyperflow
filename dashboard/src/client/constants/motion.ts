/** Motion-for-React spring params — not CSS-expressible (system.md). */
export const SPRING_SETTLE = {
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 1,
} as const;

export const SPRING_INSTRUMENT = {
  type: "spring",
  stiffness: 260,
  damping: 34,
  mass: 1,
} as const;

/** Dense / default row heights from density tokens. */
export const ROW_HEIGHT_DENSE = 28 as const;
export const ROW_HEIGHT_DEFAULT = 36 as const;

/** Inspector panel width (system.md layout grammar). */
export const INSPECTOR_WIDTH_PX = 360 as const;

/** Sidebar rail width. */
export const SIDEBAR_WIDTH_PX = 220 as const;
