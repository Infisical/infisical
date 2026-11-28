import { randomUUID } from "node:crypto";

import { AccessScope, ProjectMembershipRole } from "@app/db/schemas";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { ActorType } from "@app/lib/auth/actor-types";

import { TGrantActor } from "../services/dependencies";
import { InMemoryGrantSeeder } from "../testing/in-memory-grant-seeder";
import { InMemoryGrantStore } from "../testing/in-memory-grant-store";
import { ActorGrantsCache } from "./actor-grants-cache";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const arrange = (markerTtlSeconds?: number) => {
  let clock = Date.parse("2026-01-01T00:00:00Z");
  const store = new InMemoryGrantStore();
  const seed = new InMemoryGrantSeeder(store);
  const keyStore = new InMemoryKeyStore(() => clock);
  const cache = new ActorGrantsCache(keyStore, markerTtlSeconds);
  const orgId = randomUUID();
  const projectId = randomUUID();
  const actor: TGrantActor = { type: ActorType.USER, id: randomUUID() };
  const counts = { loads: 0, fingerprints: 0 };
  const read = (forActor: TGrantActor = actor, inProject = projectId) =>
    cache.getOrLoad({
      actor: forActor,
      projectId: inProject,
      fingerprint: () => {
        counts.fingerprints += 1;
        return store.findGrantsFingerprint(forActor, { orgId, projectId: inProject });
      },
      load: () => {
        counts.loads += 1;
        return store.findActorGrants(forActor, { scope: AccessScope.Project, orgId, projectId: inProject });
      }
    });
  const addMembership = (role: string, forActor: TGrantActor = actor) =>
    seed.membership({
      scope: AccessScope.Project,
      orgId,
      projectId,
      actor: { userId: forActor.id },
      roles: [{ role }]
    });
  const addGroupMembership = async (role: string) => {
    const group = await seed.group({ orgId });
    await seed.groupMember({ groupId: group.id, userId: actor.id });
    return seed.membership({
      scope: AccessScope.Project,
      orgId,
      projectId,
      actor: { groupId: group.id },
      roles: [{ role }]
    });
  };
  return {
    cache,
    keyStore,
    store,
    read,
    addMembership,
    addGroupMembership,
    seed,
    orgId,
    projectId,
    counts,
    actor,
    advance: (ms: number) => {
      clock += ms;
    }
  };
};

describe("ActorGrantsCache.getOrLoad", () => {
  test("should serve the cached grants while the fingerprint is unchanged", async () => {
    // Setup
    const { read, addMembership, counts } = arrange(0);
    await addMembership(ProjectMembershipRole.Member);
    await read();

    // Action
    const second = await read();

    // Assert
    expect(counts.loads).toBe(1);
    expect(second.hasActiveRole(ProjectMembershipRole.Member)).toBe(true);
  });

  test("should reload after the fingerprint changes", async () => {
    // Setup
    const { read, addMembership, addGroupMembership, counts } = arrange(0);
    await addMembership(ProjectMembershipRole.Member);
    const before = await read();

    // Action
    await addGroupMembership(ProjectMembershipRole.Admin);
    const after = await read();

    // Assert
    expect(before.hasActiveRole(ProjectMembershipRole.Admin)).toBe(false);
    expect(after.hasActiveRole(ProjectMembershipRole.Admin)).toBe(true);
    expect(counts.loads).toBe(2);
  });

  test("should check the fingerprint on every read when the marker TTL is 0", async () => {
    // Setup
    const { read, addMembership, counts } = arrange(0);
    await addMembership(ProjectMembershipRole.Member);
    await read();

    // Action
    await read();
    await read();

    // Assert
    expect(counts.fingerprints).toBe(3);
    expect(counts.loads).toBe(1);
  });

  test("should skip the fingerprint within the marker TTL and check it again after", async () => {
    // Setup
    const { read, addMembership, counts, advance } = arrange(10);
    await addMembership(ProjectMembershipRole.Member);
    await read();

    // Action
    await read();
    const withinTtl = counts.fingerprints;
    advance(11_000);
    await read();

    // Assert
    expect(withinTtl).toBe(1);
    expect(counts.fingerprints).toBe(2);
    expect(counts.loads).toBe(1);
  });

  test("should not keep a refusal, so a membership granted through a group counts on the next read", async () => {
    // Setup
    const { read, addGroupMembership } = arrange(10);
    const before = await read();

    // Action
    await addGroupMembership(ProjectMembershipRole.Member);
    const after = await read();

    // Assert
    expect(before.hasMembership).toBe(false);
    expect(after.hasMembership).toBe(true);
  });

  test("should keep the grants of different actors and projects apart", async () => {
    // Setup
    const { read, addMembership, actor } = arrange(0);
    const other: TGrantActor = { type: ActorType.USER, id: randomUUID() };
    await addMembership(ProjectMembershipRole.Admin);
    await addMembership(ProjectMembershipRole.Viewer, other);

    // Action
    const [mine, theirs, elsewhere] = [await read(actor), await read(other), await read(actor, randomUUID())];

    // Assert
    expect(mine.hasActiveRole(ProjectMembershipRole.Admin)).toBe(true);
    expect(theirs.hasActiveRole(ProjectMembershipRole.Viewer)).toBe(true);
    expect(theirs.hasActiveRole(ProjectMembershipRole.Admin)).toBe(false);
    expect(elsewhere.hasMembership).toBe(false);
  });

  test("should restore the end time of a temporary role from the cached JSON", async () => {
    // Setup
    const { read, seed, orgId, projectId, actor } = arrange(0);
    await seed.membership({
      scope: AccessScope.Project,
      orgId,
      projectId,
      actor: { userId: actor.id },
      roles: [{ role: ProjectMembershipRole.Member, temporaryAccessEndTime: new Date(Date.now() + 3_600_000) }]
    });
    await read();

    // Action
    const cached = await read();

    // Assert
    expect(cached.active().map((grant) => grant.builtInSlug())).toEqual([ProjectMembershipRole.Member]);
    expect(cached.active(new Date(Date.now() + 7_200_000))).toEqual([]);
  });

  test("should still refuse a non-member when the cache cannot be cleared", async () => {
    // Setup
    const { read, keyStore } = arrange(0);
    keyStore.deleteItem = async () => {
      throw new Error("Redis is down");
    };

    // Action
    const grants = await read();

    // Assert
    expect(grants.hasMembership).toBe(false);
  });
});

describe("ActorGrantsCache.readFingerprint", () => {
  test("should give the fingerprint of the grants it serves while the marker is live, then the fresh one", async () => {
    // Setup
    const { cache, read, addMembership, counts, store, orgId, projectId, actor, advance } = arrange();
    await addMembership(ProjectMembershipRole.Member);
    await read();
    const served = await store.findGrantsFingerprint(actor, { orgId, projectId });
    await addMembership(ProjectMembershipRole.Admin);
    const fingerprint = () => {
      counts.fingerprints += 1;
      return store.findGrantsFingerprint(actor, { orgId, projectId });
    };

    // Action
    const whileLive = await cache.readFingerprint({ actor, projectId, fingerprint });
    advance(11_000);
    const afterExpiry = await cache.readFingerprint({ actor, projectId, fingerprint });

    // Assert
    expect(whileLive).toBe(served);
    expect(afterExpiry).toBe(await store.findGrantsFingerprint(actor, { orgId, projectId }));
    expect(afterExpiry).not.toBe(served);
  });
});
