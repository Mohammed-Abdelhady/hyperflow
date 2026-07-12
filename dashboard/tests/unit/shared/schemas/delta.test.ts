import { describe, expect, it } from "vitest";
import {
  EPOCH_SEQ_ID_PATTERN,
  EpochSeqIdSchema,
  SSE_EVENT_NAMES,
  SnapshotDeltaSchema,
  formatEpochSeqId,
  parseEpochSeqId,
} from "../../../../src/shared/schemas/delta.js";

describe("delta", () => {
  it("accepts raw-fallback node patch with parseError: true", () => {
    const delta = {
      ops: [
        {
          op: "update",
          surface: "tasks",
          id: "torn-task",
          entity: {
            parseError: true as const,
            path: ".hyperflow/tasks/torn.md",
            raw: "| Status | in_progress\ntruncated",
            reason: "malformed-status-table",
          },
        },
      ],
    };

    const parsed = SnapshotDeltaSchema.safeParse(delta);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const entity = parsed.data.ops[0]?.entity;
    expect(entity).toBeDefined();
    expect(
      entity && typeof entity === "object" && "parseError" in entity
        ? entity.parseError
        : false,
    ).toBe(true);
  });

  it("exports SSE event vocabulary constants", () => {
    expect(SSE_EVENT_NAMES.SNAPSHOT_DELTA).toBe("snapshot-delta");
    expect(SSE_EVENT_NAMES.HF_EVENT).toBe("hf-event");
    expect(SSE_EVENT_NAMES.WRITE_ECHO).toBe("write-echo");
    expect(SSE_EVENT_NAMES.RESYNC_REQUIRED).toBe("resync-required");
  });

  it("validates and formats epoch-seq ids", () => {
    expect(EpochSeqIdSchema.safeParse("abc-12").success).toBe(true);
    expect(EpochSeqIdSchema.safeParse("bad").success).toBe(false);
    expect(EPOCH_SEQ_ID_PATTERN.test("epoch1-0")).toBe(true);
    expect(formatEpochSeqId("e1", 42)).toBe("e1-42");
    expect(parseEpochSeqId("e1-42")).toEqual({ epoch: "e1", seq: 42 });
    expect(parseEpochSeqId("nope")).toBeNull();
  });
});
