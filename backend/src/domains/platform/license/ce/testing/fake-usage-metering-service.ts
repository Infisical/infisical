import { Meter } from "../model/meter";
import { TUsageMeteringService } from "../service/usage-metering-service";
import { TMeteringEventInput } from "../service/usage-queue";

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
