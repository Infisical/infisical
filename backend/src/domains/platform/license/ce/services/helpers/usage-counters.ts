import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";

import { Meter } from "../../models/meter";
import { TUsageCounter } from "../dependencies";

export class CounterRegistry {
  private readonly byKey = new Map<string, TUsageCounter>();

  constructor(counters: TUsageCounter[]) {
    counters.forEach((counter) => {
      if (this.byKey.has(counter.meter.key)) {
        throw new Error(`Two usage counters were given for '${counter.meter.key}'`);
      }
      this.byKey.set(counter.meter.key, counter);
    });
  }

  get(meter: Meter) {
    return this.byKey.get(meter.key);
  }

  all() {
    return [...this.byKey.values()];
  }
}

// The two seat meters, which License builds itself; every other counter comes from the product domain that owns it.
// Counted the same way as getSeatUsage.
export const seatUsageCounters = (organizationsProjectsService: TOrganizationsProjectsService): TUsageCounter[] => [
  {
    meter: Meter.Identities,
    count: async (orgId) => {
      const { users, identities } = await organizationsProjectsService.countBillableOrgActors(orgId);
      return users + identities;
    }
  },
  {
    meter: Meter.UserIdentities,
    count: async (orgId) => (await organizationsProjectsService.countBillableOrgActors(orgId)).users
  }
];
