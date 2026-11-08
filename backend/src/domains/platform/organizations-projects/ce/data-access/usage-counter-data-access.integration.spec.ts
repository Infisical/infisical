import { randomUUID } from "node:crypto";

import { ProjectType } from "@app/db/schemas";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { Meter } from "@app/domains/platform/license/ce/module";
import { FakeLicenseRegistry } from "@app/domains/platform/license/ce/testing/fake-license-registry";

import { OrganizationsProjectsModule } from "../module";
import { seedBillableActors } from "../testing/billable-actor-fixture";

describe("OrganizationsProjectsModule usage counters", () => {
  const h = setupIntegration();

  const build = () => {
    const licenseRegistry = new FakeLicenseRegistry();
    return {
      module: new OrganizationsProjectsModule({ db: DataAccessDb.fromClient(h.db), licenseRegistry }),
      licenseRegistry
    };
  };

  test("should count only accepted, non-ghost members in a Secret Manager or KMS project or in none, each once", async () => {
    // Setup
    const { rootOrgId } = await seedBillableActors(h.db);
    const { licenseRegistry } = build();

    // Action
    const users = await licenseRegistry.counter(Meter.UserIdentities.key).count(rootOrgId);

    // Assert
    expect(users).toBe(5);
  });

  test("should count members and identities together, a sub-org's identities into its root", async () => {
    // Setup
    const { rootOrgId } = await seedBillableActors(h.db);
    const { licenseRegistry } = build();

    // Action
    const total = await licenseRegistry.counter(Meter.Identities.key).count(rootOrgId);

    // Assert
    expect(total).toBe(9);
  });

  test("should count nothing for an org with no members", async () => {
    // Setup
    await seedBillableActors(h.db);
    const { licenseRegistry } = build();

    // Action
    const total = await licenseRegistry.counter(Meter.Identities.key).count(randomUUID());

    // Assert
    expect(total).toBe(0);
  });

  test("should count every org on the instance when no org is given", async () => {
    // Setup
    const first = await seedBillableActors(h.db);
    const second = await seedBillableActors(h.db);
    const { licenseRegistry } = build();
    const perOrg =
      (await licenseRegistry.counter(Meter.Identities.key).count(first.rootOrgId)) +
      (await licenseRegistry.counter(Meter.Identities.key).count(second.rootOrgId));

    // Action
    const instance = await licenseRegistry.counter(Meter.Identities.key).count(null);

    // Assert
    expect(instance).toBeGreaterThanOrEqual(perOrg);
  });

  test("should count a project type's users and identities once each, direct or through a group, skipping deleted projects", async () => {
    // Setup
    const { rootOrgId } = await seedBillableActors(h.db);
    const { module } = build();

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
    const { module } = build();

    // Action
    const rows = await module.service.getBillableIdentityOwnershipBreakdown(rootOrgId);

    // Assert
    expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(4);
    expect(rows.find((r) => r.orgId === subOrgId)?.count).toBe(1);
  });

  test("should resolve a sub-org to its root, and a root to itself", async () => {
    // Setup
    const { rootOrgId, subOrgId } = await seedBillableActors(h.db);
    const { module } = build();

    // Action
    const roots = await Promise.all([
      module.service.resolveRootOrgId(subOrgId),
      module.service.resolveRootOrgId(rootOrgId)
    ]);

    // Assert
    expect(roots).toEqual([rootOrgId, rootOrgId]);
  });
});
