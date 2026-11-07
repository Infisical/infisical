import { TMeteredFeature } from "../model/metered-features";
import { TUsageCounter, TUsageCounterScope } from "../model/usage-counter";

// A counter whose value the test sets per org; null is the whole instance.
export class FakeUsageCounter implements TUsageCounter {
  values = new Map<string | null, number>();

  countedFor: (string | null)[] = [];

  constructor(
    readonly feature: TMeteredFeature,
    readonly scope: TUsageCounterScope = "org"
  ) {}

  set(orgId: string | null, value: number) {
    this.values.set(orgId, value);
    return this;
  }

  count = async (orgId: string | null) => {
    this.countedFor.push(orgId);
    return this.values.get(orgId) ?? 0;
  };
}
