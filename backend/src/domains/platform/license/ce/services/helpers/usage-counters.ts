import { TOrganizationsService } from "@app/domains/platform/organizations/ce/module";

import { Meter } from "../../models/meter";
import { TCount, TProductUsageCounters, TUsageCounter } from "../dependencies";

export class CounterRegistry {
  private readonly byKey = new Map<string, TUsageCounter>();

  private registered = false;

  constructor(seatCounters: TUsageCounter[]) {
    seatCounters.forEach((counter) => this.add(counter.meter, counter.count));
  }

  // Once, after the products are built. The type makes a missing counter a compile error; the checks here catch what
  // a cast or a spread lets through.
  register(counters: TProductUsageCounters) {
    if (this.registered) {
      throw new Error("Usage counters were already registered. Register every product's counters in one call.");
    }
    Object.entries(counters as Record<string, TCount>).forEach(([key, count]) => {
      const meter = Meter.fromKey(key);
      if (!meter) throw new Error(`No meter is defined for usage counter '${key}'`);
      if (meter.source !== "count") {
        throw new Error(`Meter '${key}' is recorded through metering events and takes no usage counter`);
      }
      this.add(meter, count);
    });
    const missing = Meter.all().filter((meter) => meter.source === "count" && !this.byKey.has(meter.key));
    if (missing.length > 0) {
      throw new Error(`No usage counter was registered for ${missing.map((meter) => `'${meter.key}'`).join(", ")}`);
    }
    this.registered = true;
  }

  isRegistered() {
    return this.registered;
  }

  get(meter: Meter) {
    return this.byKey.get(meter.key);
  }

  all() {
    return [...this.byKey.values()];
  }

  private add(meter: Meter, count: TCount) {
    if (this.byKey.has(meter.key)) {
      throw new Error(`Two usage counters were given for '${meter.key}'`);
    }
    this.byKey.set(meter.key, { meter, count });
  }
}

// The two seat meters, which License builds itself; every other counter comes from the product domain that owns it.
// Counted the same way as getSeatUsage.
export const seatUsageCounters = (organizationsService: TOrganizationsService): TUsageCounter[] => [
  {
    meter: Meter.Identities,
    count: async (orgId) => {
      const { users, identities } = await organizationsService.countBillableOrgActors(orgId);
      return users + identities;
    }
  },
  {
    meter: Meter.UserIdentities,
    count: async (orgId) => (await organizationsService.countBillableOrgActors(orgId)).users
  }
];
