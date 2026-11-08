import { Meter } from "../model/meter";
import { TUsageCounter } from "../service/registrations";

// A counter whose value the test sets per org; null is the whole instance.
export class FakeUsageCounter implements TUsageCounter {
  values = new Map<string | null, number>();

  countedFor: (string | null)[] = [];

  constructor(readonly meter: Meter) {}

  set(orgId: string | null, value: number) {
    this.values.set(orgId, value);
    return this;
  }

  count = async (orgId: string | null) => {
    this.countedFor.push(orgId);
    return this.values.get(orgId) ?? 0;
  };
}
