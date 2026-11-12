import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";
import { logger } from "@app/lib/logger";

import { InstanceType } from "../../models/instance-entitlements";
import { Meter } from "../../models/meter";
import { CounterRegistry } from "../helpers/counter-registry";
import { TMeteringEventInput, UsageQueue } from "../helpers/usage-queue";
import { TLicenseService } from "../license/service";

export type TUsageMeteringService = {
  // Org count on cloud, whole instance on self-hosted. Null when nothing counts the dimension.
  countUsage(orgId: string, meter: Meter): Promise<number | null>;
  // Never throws: the metered write already happened.
  emit(orgId: string, meter: Meter): void;
  recordMeteringEvents(orgId: string, events: TMeteringEventInput[]): void;
  // Call after the member change commits. Logs failures instead of throwing since the change is already in.
  syncSeats(orgId: string): Promise<void>;
};

export type TUsageMeteringServiceDeps = {
  counters: CounterRegistry;
  usageQueue: UsageQueue;
  licenseService: TLicenseService;
  organizationsProjectsService: TOrganizationsProjectsService;
};

export class UsageMeteringService implements TUsageMeteringService {
  constructor(private readonly deps: TUsageMeteringServiceDeps) {}

  async countUsage(orgId: string, meter: Meter): Promise<number | null> {
    const counter = this.deps.counters.get(meter);
    if (!counter) return null;
    return counter.count(this.deps.licenseService.getInstanceType() === InstanceType.Cloud ? orgId : null);
  }

  emit(orgId: string, meter: Meter): void {
    this.deps.usageQueue.emit(orgId, meter);
  }

  recordMeteringEvents(orgId: string, events: TMeteringEventInput[]): void {
    this.deps.usageQueue.recordMeteringEvents(orgId, events);
  }

  async syncSeats(orgId: string): Promise<void> {
    try {
      const rootOrgId = await this.deps.organizationsProjectsService.resolveRootOrgId(orgId);
      this.deps.usageQueue.emit(rootOrgId, Meter.UserIdentities);
      await this.deps.licenseService.refreshPlan(rootOrgId);
    } catch (error) {
      logger.error(error, `syncSeats: failed to sync seats [orgId=${orgId}]`);
    }
  }
}
