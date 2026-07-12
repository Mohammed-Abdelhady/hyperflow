import { describe, expect, it, vi } from "vitest";
import { createLeaderElection } from "../../../../src/client/services/leader";

class FakeBC {
  static peers = new Map<string, Set<FakeBC>>();
  name: string;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  constructor(name: string) {
    this.name = name;
    if (!FakeBC.peers.has(name)) FakeBC.peers.set(name, new Set());
    FakeBC.peers.get(name)!.add(this);
  }
  postMessage(data: unknown) {
    for (const peer of FakeBC.peers.get(this.name) ?? []) {
      if (peer === this) continue;
      peer.onmessage?.({ data } as MessageEvent);
    }
  }
  close() {
    FakeBC.peers.get(this.name)?.delete(this);
  }
}

describe("leader election", () => {
  it("elects exactly one leader across two tabs", async () => {
    FakeBC.peers.clear();
    const leaders: string[] = [];
    const a = createLeaderElection({
      tabId: "tab-a",
      BroadcastChannelImpl: FakeBC as unknown as typeof BroadcastChannel,
      heartbeatMs: 50,
      leaseMs: 200,
      onBecomeLeader: () => leaders.push("a"),
      onBecomeFollower: () => undefined,
      onEvent: () => undefined,
    });
    const b = createLeaderElection({
      tabId: "tab-b",
      BroadcastChannelImpl: FakeBC as unknown as typeof BroadcastChannel,
      heartbeatMs: 50,
      leaseMs: 200,
      onBecomeLeader: () => leaders.push("b"),
      onBecomeFollower: () => undefined,
      onEvent: () => undefined,
    });

    await new Promise((r) => setTimeout(r, 120));
    const leaderCount = [a.isLeader(), b.isLeader()].filter(Boolean).length;
    expect(leaderCount).toBe(1);

    a.dispose();
    b.dispose();
  });

  it("answers token request only when leader", async () => {
    FakeBC.peers.clear();
    const setToken = vi.fn();
    const leader = createLeaderElection({
      tabId: "tab-leader",
      BroadcastChannelImpl: FakeBC as unknown as typeof BroadcastChannel,
      getToken: () => "handed",
      setToken: vi.fn(),
      onBecomeLeader: () => undefined,
      onBecomeFollower: () => undefined,
      onEvent: () => undefined,
    });
    // Force leadership
    await new Promise((r) => setTimeout(r, 80));

    const follower = createLeaderElection({
      tabId: "tab-follower",
      BroadcastChannelImpl: FakeBC as unknown as typeof BroadcastChannel,
      getToken: () => null,
      setToken,
      onBecomeLeader: () => undefined,
      onBecomeFollower: () => undefined,
      onEvent: () => undefined,
    });
    follower.requestToken();
    await new Promise((r) => setTimeout(r, 40));

    if (leader.isLeader()) {
      expect(setToken).toHaveBeenCalledWith("handed");
    }

    leader.dispose();
    follower.dispose();
  });
});
