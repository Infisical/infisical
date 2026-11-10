import { TUsageCounter } from "./dependencies";

// The usage counters the owning domains built, one per meter.
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

  get(key: string) {
    return this.byKey.get(key);
  }

  all() {
    return [...this.byKey.values()];
  }
}
