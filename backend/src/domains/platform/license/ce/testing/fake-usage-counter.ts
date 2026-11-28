import { Meter } from "../models/meter";
import { TUsageBreakdown, TUsageCounter } from "../services/dependencies";

// A null org means the whole instance.
export class FakeUsageCounter implements TUsageCounter {
  values = new Map<string | null, number>();

  constructor(readonly meter: Meter) {}

  set(orgId: string | null, value: number) {
    this.values.set(orgId, value);
    return this;
  }

  breakdowns = new Map<string | null, TUsageBreakdown>();

  setBreakdown(orgId: string | null, breakdown: TUsageBreakdown) {
    this.breakdowns.set(orgId, breakdown);
    return this;
  }

  count = async (orgId: string | null) => this.values.get(orgId) ?? 0;

  // Unset scopes break down to their count, all of it unattributed users, so the two still agree.
  breakdown = async (orgId: string | null): Promise<TUsageBreakdown> => {
    const set = this.breakdowns.get(orgId);
    if (set) return set;
    const total = this.values.get(orgId) ?? 0;
    return { total, users: total, rows: [] };
  };
}
