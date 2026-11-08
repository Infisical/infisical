import { TLicenseRegistry } from "../module";
import { TLicenseOrganizations, TUsageCounter } from "../service/registrations";

// Holds what a domain registers with License, so its test can call the counters directly.
export class FakeLicenseRegistry implements TLicenseRegistry {
  readonly counters = new Map<string, TUsageCounter>();

  organizations: TLicenseOrganizations | null = null;

  registerUsageCounter = (counter: TUsageCounter) => {
    if (this.counters.has(counter.meter.key)) {
      throw new Error(`Two usage counters were registered for '${counter.meter.key}'`);
    }
    this.counters.set(counter.meter.key, counter);
  };

  registerOrganizations = (organizations: TLicenseOrganizations) => {
    if (this.organizations) throw new Error("The organizations directory was registered twice");
    this.organizations = organizations;
  };

  counter(key: string): TUsageCounter {
    const counter = this.counters.get(key);
    if (!counter) throw new Error(`No usage counter was registered for '${key}'`);
    return counter;
  }
}
