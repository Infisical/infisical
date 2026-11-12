import { Meter } from "../model/meter";
import { TUsageCounter } from "../services/dependencies";

// A null org means the whole instance.
export class FakeUsageCounter implements TUsageCounter {
  values = new Map<string | null, number>();

  constructor(readonly meter: Meter) {}

  set(orgId: string | null, value: number) {
    this.values.set(orgId, value);
    return this;
  }

  count = async (orgId: string | null) => this.values.get(orgId) ?? 0;
}
