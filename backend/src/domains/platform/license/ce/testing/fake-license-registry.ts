import { TLicenseOrganizations } from "../model/root-org";
import { TUsageCounter } from "../model/usage-counter";
import { TLicenseRegistry } from "../module";

// Holds what a domain registers with License, so its test can call the counters directly.
export class FakeLicenseRegistry implements TLicenseRegistry {
  readonly counters = new Map<string, TUsageCounter>();

  organizations: TLicenseOrganizations | null = null;

  registerUsageCounter = (counter: TUsageCounter) => {
    if (this.counters.has(counter.feature.key)) {
      throw new Error(`Two usage counters were registered for '${counter.feature.key}'`);
    }
    this.counters.set(counter.feature.key, counter);
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
