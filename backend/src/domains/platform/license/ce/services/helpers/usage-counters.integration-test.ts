import { setupIntegration } from "@app/domains/lib/testing/integration";
import { accessControlServices } from "@app/domains/platform/access-control/ce/testing/access-control-services";
import { OrganizationsModule } from "@app/domains/platform/organizations/ce/module";
import { seedBillableActors } from "@app/domains/platform/organizations/ce/testing/billable-actor-fixture";

import { Meter } from "../../models/meter";
import { usageCounter } from "../../testing/usage-counter";
import { seatUsageCounters } from "./usage-counters";

describe("seatUsageCounters", () => {
  const h = setupIntegration();

  const build = () =>
    seatUsageCounters(new OrganizationsModule({ db: h.db, ...accessControlServices(h.db) }).organizationsService);

  test.each([Meter.Identities, Meter.UserIdentities])(
    "should break %s down into users and owned identities that add up to the count",
    async (meter) => {
      // Setup
      const { rootOrgId } = await seedBillableActors(h.db);
      const counter = usageCounter(build(), meter);

      // Action
      const [counted, breakdown] = await Promise.all([counter.count(rootOrgId), counter.breakdown(rootOrgId)]);

      // Assert
      expect(counted).toBeGreaterThan(0);
      expect(breakdown.total).toBe(counted);
      expect(breakdown.users + breakdown.rows.reduce((sum, row) => sum + row.count, 0)).toBe(counted);
    }
  );

  test.each([Meter.Identities, Meter.UserIdentities])(
    "should break %s down across the whole instance into rows that add up to the instance count",
    async (meter) => {
      // Setup
      await seedBillableActors(h.db);
      const counter = usageCounter(build(), meter);

      // Action
      const [counted, breakdown] = await Promise.all([counter.count(null), counter.breakdown(null)]);

      // Assert
      expect(counted).toBeGreaterThan(0);
      expect(breakdown.total).toBe(counted);
      expect(breakdown.users + breakdown.rows.reduce((sum, row) => sum + row.count, 0)).toBe(counted);
    }
  );
});
