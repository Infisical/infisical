import { randomUUID } from "node:crypto";

import { AccessScope, ProjectMembershipRole, RESOURCE_SCOPE } from "@app/db/schemas";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { ActorType } from "@app/lib/auth/actor-types";

import { ActorGrantsCache } from "../../data-access/actor-grants-cache";
import { InMemoryGrantSeeder } from "../../testing/in-memory-grant-seeder";
import { InMemoryGrantStore } from "../../testing/in-memory-grant-store";
import { ActorGrantsService } from "./service";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const arrange = (markerTtlSeconds = 0) => {
  let clock = Date.parse("2026-01-01T00:00:00Z");
  const store = new InMemoryGrantStore();
  const seed = new InMemoryGrantSeeder(store);
  const service = new ActorGrantsService(
    store,
    new ActorGrantsCache(new InMemoryKeyStore(() => clock), markerTtlSeconds)
  );
  const orgId = randomUUID();
  const projectId = randomUUID();
  const userId = randomUUID();
  const actor = { type: ActorType.USER as const, id: userId };
  return {
    service,
    seed,
    orgId,
    projectId,
    userId,
    actor,
    advance: (ms: number) => {
      clock += ms;
    },
    membership: (role: string, actorColumn: { userId: string } | { groupId: string } = { userId }) =>
      seed.membership({ scope: AccessScope.Project, orgId, projectId, actor: actorColumn, roles: [{ role }] })
  };
};

describe("ActorGrantsService.getCachedProjectGrants", () => {
  test("should return the actor's project grants", async () => {
    // Setup
    const { service, actor, orgId, projectId, membership } = arrange();
    await membership(ProjectMembershipRole.Admin);

    // Action
    const grants = await service.getCachedProjectGrants({ actor, orgId, projectId });

    // Assert
    expect(grants.hasActiveBuiltInRole(ProjectMembershipRole.Admin)).toBe(true);
  });

  test("should show a role change after the fingerprint changes", async () => {
    // Setup
    const { service, seed, actor, orgId, projectId, userId, membership } = arrange();
    const first = await membership(ProjectMembershipRole.Member);
    await service.getCachedProjectGrants({ actor, orgId, projectId });

    // Action
    await seed.removeMembership(first.id);
    await membership(ProjectMembershipRole.Admin, { userId });
    const grants = await service.getCachedProjectGrants({ actor, orgId, projectId });

    // Assert
    expect(grants.hasActiveRole(ProjectMembershipRole.Admin)).toBe(true);
    expect(grants.hasActiveRole(ProjectMembershipRole.Member)).toBe(false);
  });

  test("should keep serving the cached grants within the marker TTL and refresh after it", async () => {
    // Setup
    const { service, seed, actor, orgId, projectId, membership, advance } = arrange(10);
    const first = await membership(ProjectMembershipRole.Member);
    await service.getCachedProjectGrants({ actor, orgId, projectId });
    await seed.removeMembership(first.id);

    // Action
    const within = await service.getCachedProjectGrants({ actor, orgId, projectId });
    advance(11_000);
    const after = await service.getCachedProjectGrants({ actor, orgId, projectId });

    // Assert
    expect(within.hasMembership).toBe(true);
    expect(after.hasMembership).toBe(false);
  });
});

describe("ActorGrantsService.getActorGrants", () => {
  test("should read the store now, without the cache", async () => {
    // Setup
    const { service, seed, actor, orgId, projectId, membership } = arrange(10);
    const first = await membership(ProjectMembershipRole.Member);
    await service.getCachedProjectGrants({ actor, orgId, projectId });
    await seed.removeMembership(first.id);

    // Action
    const grants = await service.getActorGrants({ actor, scope: { scope: AccessScope.Project, orgId, projectId } });

    // Assert
    expect(grants.hasMembership).toBe(false);
  });
});

describe("ActorGrantsService.getGrantsFingerprint", () => {
  test("should change when the actor's grants change", async () => {
    // Setup
    const { service, actor, orgId, projectId, membership } = arrange();
    const before = await service.getGrantsFingerprint({ actor, orgId, projectId });

    // Action
    await membership(ProjectMembershipRole.Member);
    const after = await service.getGrantsFingerprint({ actor, orgId, projectId });

    // Assert
    expect(after).not.toBe(before);
  });
});

describe("ActorGrantsService listings", () => {
  test("should list project members, the actor's folder grants and its resource memberships", async () => {
    // Setup
    const { service, seed, actor, orgId, projectId, userId, membership } = arrange();
    await membership(ProjectMembershipRole.Member);
    const folderGrant = await seed.privilege({
      actor: { userId },
      projectId,
      folder: { id: randomUUID(), role: "admin" }
    });
    await seed.membership({
      scope: RESOURCE_SCOPE,
      orgId,
      projectId,
      resourceType: "pam-folder",
      resourceId: "f1",
      actor: { userId }
    });

    // Action
    const members = await service.getProjectMemberGrants({ orgId, projectId });
    const folderGrants = await service.listFolderGrants({ actor, projectId });
    const projectFolderGrants = await service.listProjectFolderGrants({ projectId });
    const resources = await service.listResourceMemberships({ actor, projectId, resourceType: "pam-folder" });

    // Assert
    expect(members.directMembers().map(({ actor: member }) => member.id)).toEqual([userId]);
    expect(folderGrants.map((grant) => grant.id)).toEqual([folderGrant.id]);
    expect(projectFolderGrants.map((grant) => grant.id)).toEqual([folderGrant.id]);
    expect(resources.map((resource) => resource.resourceId)).toEqual(["f1"]);
  });
});
