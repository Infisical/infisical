import { randomUUID } from "node:crypto";

import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { TGrantActor } from "@app/domains/platform/access-control/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

import { FolderGrantCache } from "./folder-grant-cache";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const arrange = (markerTtlSeconds?: number) => {
  let clock = Date.parse("2026-01-01T00:00:00Z");
  const cache = new FolderGrantCache(new InMemoryKeyStore(() => clock), markerTtlSeconds);
  const actor: TGrantActor = { type: ActorType.USER, id: randomUUID() };
  const projectId = randomUUID();
  const load = (fingerprint: string) =>
    cache.getOrLoad({ actor, projectId, fingerprint: async () => fingerprint, load: async () => [] });
  return {
    cache,
    actor,
    projectId,
    load,
    advance: (ms: number) => {
      clock += ms;
    }
  };
};

describe("FolderGrantCache.findLiveFingerprint", () => {
  test("should give the fingerprint of the grants it serves while the marker is live", async () => {
    // Setup
    const { cache, actor, projectId, load } = arrange();
    await load("grants:3");

    // Action
    const fingerprint = await cache.findLiveFingerprint({ actor, projectId });

    // Assert
    expect(fingerprint).toBe("grants:3");
  });

  test("should give null before anything was loaded and once the marker expires", async () => {
    // Setup
    const { cache, actor, projectId, load, advance } = arrange();
    const before = await cache.findLiveFingerprint({ actor, projectId });
    await load("grants:3");

    // Action
    advance(11_000);

    // Assert
    expect([before, await cache.findLiveFingerprint({ actor, projectId })]).toEqual([null, null]);
  });

  test("should give null when markers are off", async () => {
    // Setup
    const { cache, actor, projectId, load } = arrange(0);
    await load("grants:3");

    // Action
    const fingerprint = await cache.findLiveFingerprint({ actor, projectId });

    // Assert
    expect(fingerprint).toBeNull();
  });
});
