import type { GenericTable } from "@shared/schemas/index.js";

/** Single role/agent bucket in a token rollup. */
export interface TokenRoleBucket {
  role: string;
  agents: number;
  tokens: number;
}

const TOTAL_ROLE_RE = /^\**\s*total\s*\**$/i;

/**
 * Parse token amounts from artefact tables / status lines.
 * Accepts `~80k`, `80k`, `89.2k`, `220000`, `1.5m`.
 */
export function parseTokenAmount(raw: string): number {
  const cleaned = raw
    .trim()
    .replace(/\*/g, "")
    .replace(/^[~≈]\s*/, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "");
  if (cleaned.length === 0) return 0;

  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)([kKmM])?$/);
  if (!match) {
    const digits = cleaned.replace(/[^\d.-]/g, "");
    const n = Number(digits);
    return Number.isFinite(n) ? n : 0;
  }

  const base = Number(match[1]);
  if (!Number.isFinite(base)) return 0;
  const suffix = match[2]?.toLowerCase();
  if (suffix === "k") return Math.round(base * 1_000);
  if (suffix === "m") return Math.round(base * 1_000_000);
  return Math.round(base);
}

/**
 * Parse a `Tokens used:` status value.
 * Shape: `thinking 89.2k · worker 142.0k · total 231.2k`
 */
export function parseTokensUsedLine(
  line: string,
): { role: string; tokens: number }[] {
  const parts = line
    .split(/[·•|,]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const out: { role: string; tokens: number }[] = [];
  for (const part of parts) {
    const m = part.match(/^([A-Za-z][\w-]*)\s+(.+)$/);
    if (!m) continue;
    const role = m[1] ?? "";
    const tokensRaw = m[2] ?? "";
    if (!role || TOTAL_ROLE_RE.test(role)) continue;
    out.push({ role: role.toLowerCase(), tokens: parseTokenAmount(tokensRaw) });
  }
  return out;
}

function headerKey(headers: string[], candidates: string[]): string | null {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c);
    if (idx >= 0) return headers[idx] ?? null;
  }
  for (const c of candidates) {
    const idx = lower.findIndex((h) => h.includes(c));
    if (idx >= 0) return headers[idx] ?? null;
  }
  return null;
}

function readCell(row: Record<string, string>, key: string | null): string {
  if (!key) return "";
  return row[key] ?? "";
}

export function rollupCostTable(table: GenericTable): {
  roles: TokenRoleBucket[];
  totalTokens: number;
  totalAgents: number;
} {
  const roleKey = headerKey(table.headers, ["role", "agent", "model"]);
  const agentsKey = headerKey(table.headers, ["agents", "count", "n"]);
  const tokensKey = headerKey(table.headers, ["tokens", "tok", "token"]);

  const roles: TokenRoleBucket[] = [];
  let totalTokens = 0;
  let totalAgents = 0;
  let sawExplicitTotal = false;

  for (const row of table.rows) {
    const roleRaw = readCell(row, roleKey).replace(/\*/g, "").trim();
    if (!roleRaw) continue;
    const agents = parseTokenAmount(readCell(row, agentsKey));
    const tokens = parseTokenAmount(readCell(row, tokensKey));

    if (TOTAL_ROLE_RE.test(roleRaw)) {
      sawExplicitTotal = true;
      totalTokens = tokens;
      totalAgents = agents;
      continue;
    }

    roles.push({ role: roleRaw, agents, tokens });
    if (!sawExplicitTotal) {
      totalTokens += tokens;
      totalAgents += agents;
    }
  }

  roles.sort((a, b) => {
    if (b.tokens !== a.tokens) return b.tokens - a.tokens;
    return a.role.localeCompare(b.role);
  });

  return { roles, totalTokens, totalAgents };
}

export function tokensUsedFromStatus(
  statusFields: Record<string, string> | undefined,
): { role: string; tokens: number }[] {
  if (!statusFields) return [];
  for (const [key, value] of Object.entries(statusFields)) {
    if (key.trim().toLowerCase() === "tokens used") {
      return parseTokensUsedLine(value);
    }
  }
  return [];
}
