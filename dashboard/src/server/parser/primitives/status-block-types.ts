import type {
  ProgressCounts,
  StatusFieldMap,
} from "@shared/schemas/common.js";

export type StatusBlockStyle = "table" | "keyline";

export type StatusBlockProgress = Pick<ProgressCounts, "done" | "total"> & {
  running?: number;
  pending?: number;
};

export type StatusBlockPresent = {
  present: true;
  style: StatusBlockStyle;
  fields: StatusFieldMap;
  progress?: StatusBlockProgress;
  degraded?: boolean;
  reason?: string;
};

export type StatusBlockAbsent = {
  present: false;
  reason?: string;
};

export type StatusBlockResult = StatusBlockPresent | StatusBlockAbsent;
