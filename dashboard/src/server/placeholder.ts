/**
 * Temporary server placeholder — replaced by Hono factory in phase 3/4.
 * Imports shared so both project-reference graphs consume shared.
 */
import { PLACEHOLDER_SHARED } from "@shared/placeholder.js";

export function placeholderServerBanner(): string {
  return `hyperflow-dashboard server scaffold · shared=${PLACEHOLDER_SHARED}`;
}
