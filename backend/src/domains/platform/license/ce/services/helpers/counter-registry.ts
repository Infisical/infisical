import { Meter } from "../../model/meter";
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
