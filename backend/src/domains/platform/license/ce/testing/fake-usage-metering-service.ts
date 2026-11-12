import { TUsageMeteringService } from "../service/usage-metering-service";
import { TMeteringEventInput } from "../service/usage-queue";

// For tests of code that reports usage: nothing is sent, and what was asked for is kept to assert on.
export class FakeUsageMeteringService implements TUsageMeteringService {
  // Org id and dimension key of each emit, in order.
  emitted: [string, string][] = [];

  meteringEvents: { orgId: string; events: TMeteringEventInput[] }[] = [];

  seatSyncs: string[] = [];

  counts = new Map<string, number>();

  countUsage = async (_orgId: string, dimensionKey: string) => this.counts.get(dimensionKey) ?? null;

  emit = (orgId: string, dimensionKey: string) => {
    this.emitted.push([orgId, dimensionKey]);
  };

  recordMeteringEvents = (orgId: string, events: TMeteringEventInput[]) => {
    this.meteringEvents.push({ orgId, events });
  };

  syncSeats = async (orgId: string) => {
    this.seatSyncs.push(orgId);
  };
}
