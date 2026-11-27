import { setupIntegration } from "@app/domains/lib/testing/integration";
import { accessControlServices } from "@app/domains/platform/access-control/ce/testing/access-control-services";
import { Meter } from "@app/domains/platform/license/ce/module";
import { usageCounter } from "@app/domains/platform/license/ce/testing/usage-counter";
import { seedBillableActors } from "@app/domains/platform/organizations/ce/testing/billable-actor-fixture";
import { buildProjectsModule } from "@app/domains/platform/projects/ce/testing/projects-module";

import { PamModule } from "./module";

describe("PamModule usage counters", () => {
  const h = setupIntegration();

  const build = () => {
    const projects = buildProjectsModule(h.db);
    return new PamModule({
      projectsService: projects.projectsService,
      projectResourcePermissionService: projects.projectResourcePermissionService,
      actorGrantsService: accessControlServices(h.db).actorGrantsService
    });
  };

  test("should break PAM identities down into users and owned identities that add up to the count", async () => {
    // Setup
    const { rootOrgId } = await seedBillableActors(h.db);
    const counter = usageCounter(build().usageCounters, Meter.PamIdentities);

    // Action
    const [counted, breakdown] = await Promise.all([counter.count(rootOrgId), counter.breakdown(rootOrgId)]);

    // Assert
    expect(breakdown.total).toBe(counted);
    expect(breakdown.users + breakdown.rows.reduce((sum, row) => sum + row.count, 0)).toBe(counted);
    expect(breakdown).toMatchObject({ total: 4, users: 3 });
  });

  test("should break PAM identities down across the whole instance into rows that add up to the instance count", async () => {
    // Setup
    await seedBillableActors(h.db);
    const counter = usageCounter(build().usageCounters, Meter.PamIdentities);

    // Action
    const [counted, breakdown] = await Promise.all([counter.count(null), counter.breakdown(null)]);

    // Assert
    expect(counted).toBeGreaterThan(0);
    expect(breakdown.total).toBe(counted);
    expect(breakdown.users + breakdown.rows.reduce((sum, row) => sum + row.count, 0)).toBe(counted);
  });
});
