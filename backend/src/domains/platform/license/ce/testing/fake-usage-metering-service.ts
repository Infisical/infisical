import { Meter } from "../models/meter";
import { TUsageBreakdown } from "../services/dependencies";
import { TMeteringEventInput, TUsageMeteringService } from "../services/usage-metering/service";

// Sends nothing, records calls to assert on.
export class FakeUsageMeteringService implements TUsageMeteringService {
  // Org id and meter of each emit, in order.
  emitted: [string, Meter][] = [];

  meteringEvents: { orgId: string; events: TMeteringEventInput[] }[] = [];

  seatSyncs: string[] = [];

  counts = new Map<Meter, number>();

  // Keyed by meter key, then scope (null = whole instance).
  breakdowns = new Map<string, Map<string | null, TUsageBreakdown>>();

  // The scope each getUsageBreakdown was asked for, in order.
  breakdownRequests: { meter: Meter; orgId: string | null }[] = [];

  setBreakdown(meter: Meter, orgId: string | null, breakdown: TUsageBreakdown) {
    const byScope = this.breakdowns.get(meter.key) ?? new Map<string | null, TUsageBreakdown>();
    byScope.set(orgId, breakdown);
    this.breakdowns.set(meter.key, byScope);
    return this;
  }

  getUsageBreakdown = async (meter: Meter, orgId: string | null) => {
    this.breakdownRequests.push({ meter, orgId });
    return this.breakdowns.get(meter.key)?.get(orgId) ?? null;
  };

  countUsage = async (_orgId: string, meter: Meter) => this.counts.get(meter) ?? null;

  emit = (orgId: string, meter: Meter) => {
    this.emitted.push([orgId, meter]);
  };

  recordMeteringEvents = (orgId: string, events: TMeteringEventInput[]) => {
    this.meteringEvents.push({ orgId, events });
  };

  syncSeats = async (orgId: string) => {
    this.seatSyncs.push(orgId);
  };
}
