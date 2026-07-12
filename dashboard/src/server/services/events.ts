/**
 * Events domain service: validate tailed lines, range reads, timeline index.
 */
import type { EventLineResult } from "@shared/schemas/event-line.js";
import {
  parseEventsLine,
  parseEventsBatch,
  type EventsBatchDiagnostics,
} from "../parser/events.js";
import {
  createNdjsonTailer,
  type NdjsonTailer,
  type TailerSignal,
} from "../watch/tailer.js";
import { pathExists, readText, readStat } from "./fs-read.js";

export type TimelineEntry = {
  index: number;
  ts?: string | undefined;
  type?: string | undefined;
  chain?: string | undefined;
  skill?: string | undefined;
  batch?: string | undefined;
  task?: string | undefined;
  stage?: string | undefined;
};

export type EventsRangeParams = {
  offset?: number | undefined;
  limit?: number | undefined;
  from?: string | undefined;
  to?: string | undefined;
};

export type EventsRangePage = {
  events: EventLineResult[];
  nextOffset?: number | undefined;
  truncated?: boolean | undefined;
};

export type EventsService = {
  /** Poll the tailer (watcher-driven). */
  poll: () => void;
  /** Consume a signal (tests / external tailer). */
  handleSignal: (signal: TailerSignal) => void;
  range: (params: EventsRangeParams) => EventsRangePage;
  timeline: () => TimelineEntry[];
  diagnostics: () => EventsBatchDiagnostics;
  /** True when events.ndjson is absent (markdown-only mode). */
  isMarkdownOnly: () => boolean;
  /** Live validated events accumulated since start / last resync. */
  liveEvents: () => EventLineResult[];
  dispose: () => void;
};

export type EventsServiceOptions = {
  eventsPath: string;
  onEvent?: ((event: EventLineResult) => void) | undefined;
  onResync?: (() => void) | undefined;
};

function emptyDiag(): EventsBatchDiagnostics {
  return {
    total: 0,
    parsed: 0,
    opaque: 0,
    unparseable: 0,
    skipped: 0,
  };
}

function eventTs(ev: EventLineResult): string | undefined {
  if (ev.variant === "v1") return ev.event.ts;
  return ev.ts;
}

function toTimeline(index: number, ev: EventLineResult): TimelineEntry {
  if (ev.variant === "v1") {
    const e = ev.event;
    const entry: TimelineEntry = {
      index,
      ts: e.ts,
      type: e.type,
      chain: e.chain,
      skill: e.skill,
    };
    if (e.batch !== undefined) entry.batch = e.batch;
    if (e.task !== undefined) entry.task = e.task;
    if (e.batch !== undefined) entry.stage = e.batch;
    return entry;
  }
  const entry: TimelineEntry = { index };
  if (ev.ts !== undefined) entry.ts = ev.ts;
  if (ev.type !== undefined) entry.type = ev.type;
  return entry;
}

function acceptLine(
  line: string,
  diag: EventsBatchDiagnostics,
): EventLineResult | null {
  diag.total += 1;
  const result = parseEventsLine(line);
  if (result === null) {
    diag.skipped += 1;
    return null;
  }
  if (result.variant === "v1") {
    diag.parsed += 1;
    return result;
  }
  // Unparseable lines are tallied and dropped (never thrown, never live).
  if (result.unparseable) {
    diag.opaque += 1;
    diag.unparseable += 1;
    return null;
  }
  diag.opaque += 1;
  return result;
}

export function createEventsService(
  options: EventsServiceOptions,
): EventsService {
  const { eventsPath } = options;
  let live: EventLineResult[] = [];
  let index: TimelineEntry[] = [];
  let diag = emptyDiag();
  let markdownOnly = !pathExists(eventsPath);

  const tailer: NdjsonTailer = createNdjsonTailer({
    path: eventsPath,
    onSignal: handleSignal,
  });

  function handleSignal(signal: TailerSignal): void {
    if (signal.kind === "resync") {
      live = [];
      index = [];
      diag = emptyDiag();
      markdownOnly = !pathExists(eventsPath);
      options.onResync?.();
      return;
    }

    markdownOnly = false;
    const accepted = acceptLine(signal.line, diag);
    if (accepted === null) return;
    live.push(accepted);
    index.push(toTimeline(live.length - 1, accepted));
    options.onEvent?.(accepted);
  }

  function loadAllFromDisk(): EventLineResult[] {
    if (!pathExists(eventsPath)) {
      markdownOnly = true;
      return [];
    }
    markdownOnly = false;
    const raw = readText(eventsPath);
    if (raw === null) return [];
    const batch = parseEventsBatch(raw.split("\n"));
    // fold diagnostics for range path without mutating live tally unless empty
    return batch.events;
  }

  function range(params: EventsRangeParams): EventsRangePage {
    const all = loadAllFromDisk();
    let filtered = all;

    if (params.from !== undefined || params.to !== undefined) {
      filtered = all.filter((ev) => {
        const ts = eventTs(ev);
        if (ts === undefined) return true;
        if (params.from !== undefined && ts < params.from) return false;
        if (params.to !== undefined && ts > params.to) return false;
        return true;
      });
    }

    const offset = params.offset ?? 0;
    const limit = params.limit ?? filtered.length;
    const slice = filtered.slice(offset, offset + limit);
    const nextOffset = offset + slice.length;
    const truncated = nextOffset < filtered.length;
    const page: EventsRangePage = { events: slice };
    if (truncated) {
      page.nextOffset = nextOffset;
      page.truncated = true;
    } else if (slice.length > 0) {
      page.nextOffset = nextOffset;
    }
    return page;
  }

  // Initial presence probe
  const st = readStat(eventsPath);
  if (st) markdownOnly = false;

  return {
    poll: () => tailer.poll(),
    handleSignal,
    range,
    timeline: () => index.slice(),
    diagnostics: () => ({ ...diag }),
    isMarkdownOnly: () => markdownOnly || !pathExists(eventsPath),
    liveEvents: () => live.slice(),
    dispose: () => tailer.dispose(),
  };
}
