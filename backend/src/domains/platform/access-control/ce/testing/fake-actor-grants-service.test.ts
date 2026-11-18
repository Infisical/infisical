import { randomUUID } from "node:crypto";

import { AccessScope, ProjectMembershipRole } from "@app/db/schemas";
import { ActorType } from "@app/lib/auth/actor-types";

import { buildAccessControl } from "./build-access-control";
import { FakeActorGrantsService } from "./fake-actor-grants-service";

describe("FakeActorGrantsService.getCachedProjectGrants", () => {
  test("should answer like the real service over the same store, and show a change at once", async () => {
    // Setup
    const { grantStore, actorGrantsService, seed } = buildAccessControl();
    const fake = new FakeActorGrantsService(grantStore);
    const orgId = randomUUID();
    const projectId = randomUUID();
    const userId = randomUUID();
    const actor = { type: ActorType.USER as const, id: userId };
    const membership = await seed.membership({
      scope: AccessScope.Project,
      orgId,
      projectId,
      actor: { userId },
      roles: [{ role: ProjectMembershipRole.Member }]
    });

    // Action
    const [fromFake, fromReal] = await Promise.all([
      fake.getCachedProjectGrants({ actor, orgId, projectId }),
      actorGrantsService.getCachedProjectGrants({ actor, orgId, projectId })
    ]);
    await seed.removeMembership(membership.id);
    const [fakeAfter, realAfter] = await Promise.all([
      fake.getCachedProjectGrants({ actor, orgId, projectId }),
      actorGrantsService.getCachedProjectGrants({ actor, orgId, projectId })
    ]);

    // Assert
    expect(fromFake.toJSON()).toEqual(fromReal.toJSON());
    expect(fakeAfter.hasMembership).toBe(false);
    expect(realAfter.hasMembership).toBe(false);
  });
});
