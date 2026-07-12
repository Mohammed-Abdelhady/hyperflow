/**
 * SSE hub — sole assigner of epoch-seq ids and sole SSE frame writer.
 * Composes ring-buffer replay + client registry fan-out.
 */
import { randomBytes } from "node:crypto";
import {
  formatEpochSeqId,
  parseEpochSeqId,
  SSE_EVENT_NAMES,
  type SseEventName,
  type ResyncRequiredPayload,
} from "@shared/schemas/delta.js";
import {
  createRingBuffer,
  DEFAULT_RING_CAPACITY,
  type RingBuffer,
} from "./ring-buffer.js";
import {
  createClientRegistry,
  type ClientRegistry,
  type ClientRegistryOptions,
  type ClientSink,
} from "./clients.js";

export type SseFrameRecord = {
  id: string;
  seq: number;
  event: SseEventName;
  data: string;
  /** Fully serialized SSE wire frame. */
  wire: string;
};

export type HubPublishInput = {
  event: SseEventName;
  /** JSON-serializable payload. */
  data: unknown;
};

export type SubscribeResult = {
  clientId: string;
  /** True when resync-required was sent instead of replay. */
  resync: boolean;
};

export type SseHubOptions = {
  /** Process epoch (default: crypto-random). */
  epoch?: string | undefined;
  ringCapacity?: number | undefined;
  clientOptions?: ClientRegistryOptions | undefined;
};

export type SseHub = {
  readonly epoch: string;
  publish: (input: HubPublishInput) => SseFrameRecord;
  subscribe: (
    sink: ClientSink,
    lastEventId?: string | null,
    clientId?: string,
  ) => SubscribeResult;
  unsubscribe: (clientId: string) => void;
  lastSeq: () => number;
  clientCount: () => number;
  dispose: () => void;
};

/** Serialize a named SSE event with id. */
export function serializeSseFrame(
  id: string,
  event: string,
  data: string,
): string {
  const lines = data.split("\n");
  let out = `id: ${id}\nevent: ${event}\n`;
  for (const line of lines) {
    out += `data: ${line}\n`;
  }
  out += "\n";
  return out;
}

function mintEpoch(): string {
  return randomBytes(8).toString("hex");
}

function mintClientId(): string {
  return randomBytes(6).toString("hex");
}

function advisoryResyncWire(
  epoch: string,
  reason: ResyncRequiredPayload["reason"],
): string {
  const payload: ResyncRequiredPayload = { reason };
  return serializeSseFrame(
    formatEpochSeqId(epoch, 0),
    SSE_EVENT_NAMES.RESYNC_REQUIRED,
    JSON.stringify(payload),
  );
}

export function createSseHub(options: SseHubOptions = {}): SseHub {
  const epoch = options.epoch ?? mintEpoch();
  let seq = 0;
  const ring: RingBuffer<SseFrameRecord> = createRingBuffer(
    options.ringCapacity ?? DEFAULT_RING_CAPACITY,
  );
  const clients: ClientRegistry = createClientRegistry(options.clientOptions);

  /**
   * Live frames buffered per client while replay is in flight so ordering
   * stays replay-then-live.
   */
  const replaying = new Map<string, string[]>();

  function publish(input: HubPublishInput): SseFrameRecord {
    seq += 1;
    const id = formatEpochSeqId(epoch, seq);
    const data =
      typeof input.data === "string" ? input.data : JSON.stringify(input.data);
    const wire = serializeSseFrame(id, input.event, data);
    const record: SseFrameRecord = {
      id,
      seq,
      event: input.event,
      data,
      wire,
    };
    ring.append(seq, record);

    for (const clientId of clients.ids()) {
      const queue = replaying.get(clientId);
      if (queue) {
        queue.push(wire);
      } else {
        clients.writeTo(clientId, wire);
      }
    }
    return record;
  }

  function subscribe(
    sink: ClientSink,
    lastEventId?: string | null,
    clientId?: string,
  ): SubscribeResult {
    const id = clientId ?? mintClientId();
    replaying.set(id, []);
    clients.register(id, sink);

    const raw = lastEventId?.trim() ?? "";
    let resync = false;

    if (raw.length === 0) {
      resync = true;
      clients.writeTo(id, advisoryResyncWire(epoch, "unknown"));
    } else {
      const parsed = parseEpochSeqId(raw);
      if (!parsed) {
        resync = true;
        clients.writeTo(id, advisoryResyncWire(epoch, "unknown"));
      } else if (parsed.epoch !== epoch) {
        resync = true;
        clients.writeTo(id, advisoryResyncWire(epoch, "epoch-mismatch"));
      } else {
        const result = ring.after(parsed.seq);
        if (!result.ok) {
          resync = true;
          const reason =
            result.reason === "out-of-window" ? "buffer-overflow" : "unknown";
          clients.writeTo(id, advisoryResyncWire(epoch, reason));
        } else {
          for (const entry of result.entries) {
            clients.writeTo(id, entry.payload.wire);
          }
        }
      }
    }

    const queued = replaying.get(id) ?? [];
    replaying.delete(id);
    for (const frame of queued) {
      clients.writeTo(id, frame);
    }

    return { clientId: id, resync };
  }

  function unsubscribe(clientId: string): void {
    replaying.delete(clientId);
    clients.unregister(clientId);
  }

  return {
    epoch,
    publish,
    subscribe,
    unsubscribe,
    lastSeq: () => seq,
    clientCount: () => clients.size(),
    dispose() {
      replaying.clear();
      clients.dispose();
      ring.clear();
    },
  };
}
