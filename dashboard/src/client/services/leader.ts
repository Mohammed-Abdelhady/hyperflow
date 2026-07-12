import { LEADER_CHANNEL_NAME } from "../constants/auth";
import {
  LEADER_HEARTBEAT_MS,
  LEADER_LEASE_MS,
} from "../constants/store";
import { writeSessionToken, readSessionToken } from "../utils/handshake";

export type LeaderFrame =
  | { type: "announce"; tabId: string; ts: number }
  | { type: "heartbeat"; tabId: string; ts: number }
  | { type: "event"; id: string; name: string; data: string }
  | { type: "token-request"; tabId: string }
  | { type: "token-response"; tabId: string; token: string }
  | { type: "goodbye"; tabId: string };

export interface LeaderElectionOptions {
  channelName?: string;
  tabId?: string;
  heartbeatMs?: number;
  leaseMs?: number;
  now?: () => number;
  BroadcastChannelImpl?: typeof BroadcastChannel;
  onBecomeLeader: () => void;
  onBecomeFollower: () => void;
  onEvent: (frame: { id: string; name: string; data: string }) => void;
  getToken?: () => string | null;
  setToken?: (token: string) => void;
}

function randomTabId(): string {
  return `tab-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function createLeaderElection(options: LeaderElectionOptions) {
  const channelName = options.channelName ?? LEADER_CHANNEL_NAME;
  const tabId = options.tabId ?? randomTabId();
  const heartbeatMs = options.heartbeatMs ?? LEADER_HEARTBEAT_MS;
  const leaseMs = options.leaseMs ?? LEADER_LEASE_MS;
  const now = options.now ?? (() => Date.now());
  const BC = options.BroadcastChannelImpl ?? BroadcastChannel;
  const getToken = options.getToken ?? readSessionToken;
  const setToken = options.setToken ?? writeSessionToken;

  const channel = new BC(channelName);
  let isLeader = false;
  let leaderId: string | null = null;
  let lastLeaderTs = 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  const post = (frame: LeaderFrame) => {
    channel.postMessage(frame);
  };

  const becomeLeader = () => {
    if (isLeader) return;
    isLeader = true;
    leaderId = tabId;
    lastLeaderTs = now();
    post({ type: "announce", tabId, ts: lastLeaderTs });
    options.onBecomeLeader();
    startHeartbeat();
  };

  const becomeFollower = (id: string, ts: number) => {
    const wasLeader = isLeader;
    isLeader = false;
    leaderId = id;
    lastLeaderTs = ts;
    stopHeartbeat();
    if (wasLeader) options.onBecomeFollower();
    else options.onBecomeFollower();
  };

  const startHeartbeat = () => {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!isLeader) return;
      const ts = now();
      lastLeaderTs = ts;
      post({ type: "heartbeat", tabId, ts });
    }, heartbeatMs);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const maybeElect = () => {
    if (disposed) return;
    const age = now() - lastLeaderTs;
    if (!leaderId || age > leaseMs) {
      // Deterministic tie-break: lower tabId wins when simultaneous.
      becomeLeader();
      return;
    }
    if (leaderId === tabId) {
      if (!isLeader) becomeLeader();
    }
  };

  channel.onmessage = (ev: MessageEvent<LeaderFrame>) => {
    const frame = ev.data;
    if (!frame || typeof frame !== "object") return;

    switch (frame.type) {
      case "announce":
      case "heartbeat": {
        if (frame.tabId === tabId) return;
        // Lexicographic: smaller tabId keeps leadership on conflict.
        if (
          !leaderId ||
          frame.tabId < (leaderId ?? "") ||
          leaderId === frame.tabId
        ) {
          if (frame.tabId < tabId || leaderId === frame.tabId) {
            becomeFollower(frame.tabId, frame.ts);
          } else if (!isLeader && frame.tabId > tabId && leaderId === tabId) {
            // we remain leader
            lastLeaderTs = now();
          }
        }
        if (frame.tabId === leaderId) {
          lastLeaderTs = frame.ts;
        }
        break;
      }
      case "event": {
        if (!isLeader) {
          options.onEvent({
            id: frame.id,
            name: frame.name,
            data: frame.data,
          });
        }
        break;
      }
      case "token-request": {
        if (isLeader && frame.tabId !== tabId) {
          const token = getToken();
          if (token) {
            post({ type: "token-response", tabId: frame.tabId, token });
          }
        }
        break;
      }
      case "token-response": {
        if (frame.tabId === tabId && frame.token) {
          setToken(frame.token);
        }
        break;
      }
      case "goodbye": {
        if (frame.tabId === leaderId) {
          leaderId = null;
          lastLeaderTs = 0;
          maybeElect();
        }
        break;
      }
      default:
        break;
    }
  };

  const leaseWatch = setInterval(maybeElect, heartbeatMs);

  // Bootstrap election.
  post({ type: "announce", tabId, ts: now() });
  setTimeout(maybeElect, 50);

  return {
    tabId,
    isLeader: () => isLeader,
    /** Leader rebroadcasts verbatim {id,name,data}. */
    broadcastEvent: (id: string, name: string, data: string) => {
      if (!isLeader) return;
      post({ type: "event", id, name, data });
    },
    requestToken: () => {
      if (getToken()) return;
      post({ type: "token-request", tabId });
    },
    dispose: () => {
      disposed = true;
      stopHeartbeat();
      clearInterval(leaseWatch);
      if (isLeader) post({ type: "goodbye", tabId });
      channel.close();
    },
  };
}

export type LeaderElection = ReturnType<typeof createLeaderElection>;
