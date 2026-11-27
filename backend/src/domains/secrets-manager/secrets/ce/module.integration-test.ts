import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { accessControlServices } from "@app/domains/platform/access-control/ce/testing/access-control-services";
import { Meter } from "@app/domains/platform/license/ce/module";
import { usageCounter } from "@app/domains/platform/license/ce/testing/usage-counter";
import { seedBillableActors } from "@app/domains/platform/organizations/ce/testing/billable-actor-fixture";
import { buildProjectsModule } from "@app/domains/platform/projects/ce/testing/projects-module";

import { SecretsModule } from "./module";

describe("SecretsModule usage counters", () => {
  const h = setupIntegration();

  const build = () => {
    const projects = buildProjectsModule(h.db);
    return new SecretsModule({
      db: h.db,
      keyStore: new InMemoryKeyStore(),
      ...accessControlServices(h.db),
      projectPermissionService: projects.projectPermissionService,
      projectsService: projects.projectsService,
      cacheMarkerTtlSeconds: 0
    });
  };

  test("should break secret identities down into users and owned identities that add up to the count", async () => {
    // Setup
    const { rootOrgId } = await seedBillableActors(h.db);
    const counter = usageCounter(build().usageCounters, Meter.SecretIdentities);

    // Action
    const [counted, breakdown] = await Promise.all([counter.count(rootOrgId), counter.breakdown(rootOrgId)]);

    // Assert
    expect(breakdown.total).toBe(counted);
    expect(breakdown.users + breakdown.rows.reduce((sum, row) => sum + row.count, 0)).toBe(counted);
    expect(breakdown).toMatchObject({ total: 3, users: 2 });
  });
});
