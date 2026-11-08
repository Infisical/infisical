import { TUsageCounter } from "../model/usage-counter";

// The usage counters the owning domains registered, one per metered dimension.
export class CounterRegistry {
  private readonly byKey = new Map<string, TUsageCounter>();

  register(counter: TUsageCounter) {
    if (this.byKey.has(counter.feature.key)) {
      throw new Error(`Two usage counters were registered for '${counter.feature.key}'`);
    }
    this.byKey.set(counter.feature.key, counter);
  }

  get(key: string) {
    return this.byKey.get(key);
  }

  all() {
    return [...this.byKey.values()];
  }
}
