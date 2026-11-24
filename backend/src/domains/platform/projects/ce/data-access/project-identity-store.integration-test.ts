import { randomUUID } from "node:crypto";

import { ProjectType, TableName } from "@app/db/schemas";
import { poolStoreConnection } from "@app/domains/lib/data-access";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { seedBillableActors } from "@app/domains/platform/organizations/ce/testing/billable-actor-fixture";

import { buildProjectsModule } from "../testing/projects-module";
import { ProjectIdentityStore } from "./project-identity-store";

describe("ProjectsService project identity counts", () => {
  const h = setupIntegration();

  const build = () => ({ module: buildProjectsModule(h.db) });

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

describe("ProjectIdentityStore.findIdentityName", () => {
  const h = setupIntegration();

  test("should read an identity's current name, and nothing for one that does not exist", async () => {
    // Setup
    const org = await h.factories.organization();
    const [identity] = await h.db(TableName.Identity).insert({ name: "billing", orgId: org.id }).returning("*");
    await h.db(TableName.Identity).where({ id: identity.id }).update({ name: "payments" });
    const store = new ProjectIdentityStore(poolStoreConnection(h.db));

    // Action
    const names = await Promise.all([store.findIdentityName(identity.id), store.findIdentityName(randomUUID())]);

    // Assert
    expect(names).toEqual(["payments", null]);
  });
});
