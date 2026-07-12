/**
 * Temporary client placeholder — replaced by SPA bootstrap in phase 5.
 * Imports shared so the client project-reference graph consumes shared.
 */
import { PLACEHOLDER_SHARED } from "@shared/placeholder";

export function placeholderClientBanner(): string {
  return `hyperflow-dashboard client scaffold · shared=${PLACEHOLDER_SHARED}`;
}
