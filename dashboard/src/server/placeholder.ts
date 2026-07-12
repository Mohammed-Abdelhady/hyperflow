/**
 * Temporary server placeholder — replaced by Hono factory in phase 3/4.
 * Imports shared so both project-reference graphs consume shared.
 */
import { HYPERFLOW_TOKEN_HEADER } from "@shared/schemas/api.js";

export function placeholderServerBanner(): string {
  return `hyperflow-dashboard server scaffold · token-header=${HYPERFLOW_TOKEN_HEADER}`;
}
