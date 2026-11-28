import { TOrganizationsService } from "@app/domains/platform/organizations/ce/module";
import { logger } from "@app/lib/logger";

import { Meter } from "../../models/meter";
import { TUsageBreakdown } from "../dependencies";
import { CounterRegistry } from "../helpers/usage-counters";
import { UsageQueue } from "../helpers/usage-queue";
import { TLicenseService } from "../license/service";

// The license server dedups on (eventId, occurredAt), so keep both stable per fact. quantity is required (the
// server reads a missing one as 0); a count meter ignores it, so pass 1.
export type TMeteringEventInput = {
  eventId: string;
  meter: Meter;
  quantity: number;
  occurredAt: Date;
};

export type TUsageMeteringService = {
  // Org count on cloud, whole instance on self-hosted. Null when nothing counts the dimension.
  countUsage(orgId: string, meter: Meter): Promise<number | null>;
  // What a meter's count is made of, for the given scope as is (an org id, or null for the whole instance). Null when
  // nothing counts the dimension.
  getUsageBreakdown(meter: Meter, orgId: string | null): Promise<TUsageBreakdown | null>;
  // Never throws: the metered write already happened.
  emit(orgId: string, meter: Meter): void;
  recordMeteringEvents(orgId: string, events: TMeteringEventInput[]): void;
  // Call after the member change commits. Logs failures instead of throwing since the change is already in.
  syncSeats(orgId: string): Promise<void>;
};

export class UsageMeteringService implements TUsageMeteringService {
  constructor(
    private readonly counterRegistry: CounterRegistry,
    private readonly usageQueue: UsageQueue,
    private readonly licenseService: TLicenseService,
    private readonly organizationsService: TOrganizationsService
  ) {}

  async countUsage(orgId: string, meter: Meter): Promise<number | null> {
    const counter = this.counterRegistry.get(meter);
    if (!counter) return null;
    return counter.count(this.licenseService.getInstanceEntitlements().isCloud() ? orgId : null);
  }

  async getUsageBreakdown(meter: Meter, orgId: string | null): Promise<TUsageBreakdown | null> {
    const counter = this.counterRegistry.get(meter);
    if (!counter) return null;
    return counter.breakdown(orgId);
  }

  emit(orgId: string, meter: Meter): void {
    this.usageQueue.emit(orgId, meter);
  }

  recordMeteringEvents(orgId: string, events: TMeteringEventInput[]): void {
    this.usageQueue.recordMeteringEvents(orgId, events);
  }

  async syncSeats(orgId: string): Promise<void> {
    try {
      const rootOrgId = await this.organizationsService.resolveRootOrgId(orgId);
      this.usageQueue.emit(rootOrgId, Meter.UserIdentities);
      await this.licenseService.refreshPlan(rootOrgId);
    } catch (error) {
      logger.error(error, `syncSeats: failed to sync seats [orgId=${orgId}]`);
    }
  }
}
