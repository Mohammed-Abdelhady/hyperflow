/**
 * Background registry.json parser with per-entry degradation.
 * No filesystem IO. Never throws.
 */

import type {
  BackgroundAgent,
  BackgroundAgentEntry,
  BackgroundRegistry,
  BackgroundStatusClass,
  BackgroundSurface,
} from "@shared/schemas/snapshot-ops.js";
import {
  createRawFallback,
  diagnostic,
  normalizeInput,
  parseHealthOk,
  withParseFallback,
} from "./primitives/index.js";

export type ParseBackgroundOptions = {
  path?: string;
  raw: string | null | undefined;
  /** Map of output_buffer path → exists */
  bufferExists?: Record<string, boolean>;
};

function classifyStatus(status: string): BackgroundStatusClass {
  const s = status.toLowerCase();
  if (s === "running") return "in-flight";
  if (s === "complete" || s === "completed") return "completed";
  if (s === "stalled") return "stalled";
  if (s === "error" || s === "errored" || s === "failed") return "errored";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  return "unknown";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseAgent(
  entry: unknown,
  bufferExists?: Record<string, boolean>,
): BackgroundAgentEntry {
  if (!isRecord(entry)) {
    return { raw: true, data: entry, reason: "not-object" };
  }
  const id = entry["id"];
  const status = entry["status"];
  if (typeof id !== "string" || id.length === 0 || typeof status !== "string") {
    return { raw: true, data: entry, reason: "missing-id-or-status" };
  }

  const known = new Set([
    "id",
    "purpose",
    "fired_at",
    "timeout_at",
    "status",
    "output_buffer",
    "blocks_step",
  ]);
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (!known.has(k)) extras[k] = v;
  }

  const agent: BackgroundAgent = {
    id,
    status,
    statusClass: classifyStatus(status),
  };
  if (typeof entry["purpose"] === "string") agent.purpose = entry["purpose"];
  if (typeof entry["fired_at"] === "string") agent.fired_at = entry["fired_at"];
  if (typeof entry["timeout_at"] === "string") {
    agent.timeout_at = entry["timeout_at"];
  }
  if (typeof entry["output_buffer"] === "string") {
    agent.output_buffer = entry["output_buffer"];
    if (bufferExists && entry["output_buffer"] in bufferExists) {
      agent.outputBufferExists = bufferExists[entry["output_buffer"]];
    }
  }
  if (entry["blocks_step"] === null || typeof entry["blocks_step"] === "string") {
    agent.blocks_step = entry["blocks_step"] as string | null;
  }
  if (Object.keys(extras).length > 0) agent.extras = extras;
  return agent;
}

function parseBackgroundInner(
  opts: ParseBackgroundOptions,
): BackgroundSurface {
  const path = opts.path ?? "background/registry.json";

  if (opts.raw === null || opts.raw === undefined || opts.raw.trim() === "") {
    const empty: BackgroundRegistry = {
      path,
      agents: [],
      parseHealth: parseHealthOk("background-empty"),
      present: false,
    };
    return empty;
  }

  const text = normalizeInput(opts.raw);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return createRawFallback({
      path,
      raw: text,
      reason: "invalid-json",
      alreadyNormalized: true,
    });
  }

  if (!isRecord(json)) {
    return createRawFallback({
      path,
      raw: text,
      reason: "root-not-object",
      alreadyNormalized: true,
    });
  }

  const agentsRaw = json["agents"];
  const list = Array.isArray(agentsRaw) ? agentsRaw : [];
  const agents = list.map((a) => parseAgent(a, opts.bufferExists));
  const rawCount = agents.filter(
    (a) => "raw" in a && a.raw === true,
  ).length;

  const reg: BackgroundRegistry = {
    path,
    agents,
    present: true,
    parseHealth: parseHealthOk(
      "background",
      rawCount > 0
        ? [diagnostic("raw-entries", `${rawCount} agent entries degraded`)]
        : [],
    ),
    raw: text,
  };
  return reg;
}

/** Parse background registry.json content. Never throws. */
export function parseBackground(
  opts: ParseBackgroundOptions,
): BackgroundSurface {
  return withParseFallback(
    opts.path ?? "background/registry.json",
    opts.raw ?? "",
    () => parseBackgroundInner(opts),
  );
}
