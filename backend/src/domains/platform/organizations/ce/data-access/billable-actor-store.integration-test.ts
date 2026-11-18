import { randomUUID } from "node:crypto";

import { setupIntegration } from "@app/domains/lib/testing/integration";

import { OrganizationsModule } from "../module";
import { seedBillableActors } from "../testing/billable-actor-fixture";

describe("OrganizationsService billable actor counts", () => {
  const h = setupIntegration();

  const build = () => ({ module: new OrganizationsModule({ db: h.db }) });
  const countSeats = async (module: OrganizationsModule, orgId: string | null) => {
    const { users, identities } = await module.organizationsService.countBillableOrgActors(orgId);
    return users + identities;
  };

  test("should count only accepted, non-ghost members in a Secret Manager or KMS project or in none, each once", async () => {
    // Setup
    const { rootOrgId } = await seedBillableActors(h.db);
    const { module } = build();

    // Action
    const { users } = await module.organizationsService.countBillableOrgActors(rootOrgId);

    // Assert
    expect(users).toBe(5);
  });

  test("should count members and identities together, a sub-org's identities into its root", async () => {
    // Setup
    const { rootOrgId } = await seedBillableActors(h.db);
    const { module } = build();

    // Action
    const total = await countSeats(module, rootOrgId);

    // Assert
    expect(total).toBe(9);
  });

  test("should count nothing for an org with no members", async () => {
    // Setup
    await seedBillableActors(h.db);
    const { module } = build();

    // Action
    const total = await countSeats(module, randomUUID());

    // Assert
    expect(total).toBe(0);
  });

  test("should count every org on the instance when no org is given", async () => {
    // Setup
    const first = await seedBillableActors(h.db);
    const second = await seedBillableActors(h.db);
    const { module } = build();
    const perOrg = (await countSeats(module, first.rootOrgId)) + (await countSeats(module, second.rootOrgId));

    // Action
    const instance = await countSeats(module, null);

    // Assert
    expect(instance).toBeGreaterThanOrEqual(perOrg);
  });

  test("should attribute billable identities to the org and project that own them", async () => {
    // Setup
    const { rootOrgId, subOrgId } = await seedBillableActors(h.db);
    const { module } = build();

    // Action
    const rows = await module.organizationsService.getBillableIdentityOwnershipBreakdown(rootOrgId);

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
      module.organizationsService.resolveRootOrgId(subOrgId),
      module.organizationsService.resolveRootOrgId(rootOrgId)
    ]);

    // Assert
    expect(roots).toEqual([rootOrgId, rootOrgId]);
  });
});
