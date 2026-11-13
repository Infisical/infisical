import { Meter } from "../models/meter";
import { TMeteringEventInput, TUsageMeteringService } from "../services/usage-metering/service";

// Sends nothing, records calls to assert on.
export class FakeUsageMeteringService implements TUsageMeteringService {
  // Org id and meter of each emit, in order.
  emitted: [string, Meter][] = [];

  meteringEvents: { orgId: string; events: TMeteringEventInput[] }[] = [];

  seatSyncs: string[] = [];

  counts = new Map<Meter, number>();

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
