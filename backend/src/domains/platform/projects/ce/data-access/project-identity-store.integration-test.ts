import { randomUUID } from "node:crypto";

import { ProjectType } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { seedBillableActors } from "@app/domains/platform/organizations/ce/testing/billable-actor-fixture";

import { ProjectsModule } from "../module";

describe("ProjectsService project identity counts", () => {
  const h = setupIntegration();

  const build = () => ({ module: new ProjectsModule({ db: h.db }) });

  test("should count a project type's users and identities once each, direct or through a group, skipping deleted projects", async () => {
    // Setup
    const { rootOrgId } = await seedBillableActors(h.db);
    const { module } = build();

    // Action
    const [secretManager, pam, otherOrg] = await Promise.all([
      module.projectsService.countProjectIdentitiesByKind(ProjectType.SecretManager, rootOrgId),
      module.projectsService.countProjectIdentitiesByKind(ProjectType.PAM, rootOrgId),
      module.projectsService.countProjectIdentities(ProjectType.SecretManager, randomUUID())
    ]);

    // Assert
    expect(secretManager).toEqual({ users: 2, identities: 1 });
    expect(pam).toEqual({ users: 3, identities: 1 });
    expect(otherOrg).toBe(0);
  });
});
