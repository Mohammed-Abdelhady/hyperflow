/**
 * Temporary client placeholder — replaced by SPA bootstrap in phase 5.
 * Imports shared so the client project-reference graph consumes shared.
 */
import { HYPERFLOW_TOKEN_HEADER } from "@shared/schemas/api";

export function placeholderClientBanner(): string {
  return `hyperflow-dashboard client scaffold · token-header=${HYPERFLOW_TOKEN_HEADER}`;
}
