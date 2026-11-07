import { randomUUID } from "node:crypto";

import { ProjectType } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { IdentitiesMeter, UserIdentities } from "@app/domains/platform/license/ce/module";

import { OrganizationsProjectsModule } from "../module";
import { seedBillableActors } from "../testing/billable-actor-fixture";

describe("OrganizationsProjectsModule usage counters", () => {
  const h = setupIntegration();

  const counter = (module: OrganizationsProjectsModule, key: string) =>
    module.usageCounters.find((c) => c.feature.key === key)!;

  test("should count only accepted, non-ghost members in a Secret Manager or KMS project or in none, each once", async () => {
    // Setup
    const { rootOrgId } = await seedBillableActors(h.db);
    const module = new OrganizationsProjectsModule({ db: h.db });

    // Action
    const users = await counter(module, UserIdentities.key).count(rootOrgId);

    // Assert
    expect(users).toBe(5);
  });

  test("should count members and identities together, a sub-org's identities into its root", async () => {
    // Setup
    const { rootOrgId } = await seedBillableActors(h.db);
    const module = new OrganizationsProjectsModule({ db: h.db });

    // Action
    const total = await counter(module, IdentitiesMeter.key).count(rootOrgId);

    // Assert
    expect(total).toBe(9);
  });

  test("should count nothing for an org with no members", async () => {
    // Setup
    await seedBillableActors(h.db);
    const module = new OrganizationsProjectsModule({ db: h.db });

    // Action
    const total = await counter(module, IdentitiesMeter.key).count(randomUUID());

    // Assert
    expect(total).toBe(0);
  });

  test("should count every org on the instance when no org is given", async () => {
    // Setup
    const first = await seedBillableActors(h.db);
    const second = await seedBillableActors(h.db);
    const module = new OrganizationsProjectsModule({ db: h.db });
    const perOrg =
      (await counter(module, IdentitiesMeter.key).count(first.rootOrgId)) +
      (await counter(module, IdentitiesMeter.key).count(second.rootOrgId));

    // Action
    const instance = await counter(module, IdentitiesMeter.key).count(null);

    // Assert
    expect(instance).toBeGreaterThanOrEqual(perOrg);
  });

  test("should count a project type's users and identities once each, direct or through a group, skipping deleted projects", async () => {
    // Setup
    const { rootOrgId } = await seedBillableActors(h.db);
    const module = new OrganizationsProjectsModule({ db: h.db });

    // Action
    const [secretManager, pam, otherOrg] = await Promise.all([
      module.service.countProjectIdentitiesByKind(ProjectType.SecretManager, rootOrgId),
      module.service.countProjectIdentitiesByKind(ProjectType.PAM, rootOrgId),
      module.service.countProjectIdentities(ProjectType.SecretManager, randomUUID())
    ]);

    // Assert
    expect(secretManager).toEqual({ users: 2, identities: 1 });
    expect(pam).toEqual({ users: 3, identities: 1 });
    expect(otherOrg).toBe(0);
  });

  test("should attribute billable identities to the org and project that own them", async () => {
    // Setup
    const { rootOrgId, subOrgId } = await seedBillableActors(h.db);
    const module = new OrganizationsProjectsModule({ db: h.db });

    // Action
    const rows = await module.service.getBillableIdentityOwnershipBreakdown(rootOrgId);

    // Assert
    expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(4);
    expect(rows.find((r) => r.orgId === subOrgId)?.count).toBe(1);
  });

  test("should resolve a sub-org to its root, and a root to itself", async () => {
    // Setup
    const { rootOrgId, subOrgId } = await seedBillableActors(h.db);
    const module = new OrganizationsProjectsModule({ db: h.db });

    // Action
    const roots = await Promise.all([
      module.service.resolveRootOrgId(subOrgId),
      module.service.resolveRootOrgId(rootOrgId)
    ]);

    // Assert
    expect(roots).toEqual([rootOrgId, rootOrgId]);
  });
});
