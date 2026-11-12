import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";
import { logger } from "@app/lib/logger";

import { InstanceType } from "../model/instance-entitlements";
import { Meter } from "../model/meter";
import { CounterRegistry } from "./counter-registry";
import { TLicenseService } from "./license-service";
import { TMeteringEventInput, UsageQueue } from "./usage-queue";

export type TUsageMeteringService = {
  // Org count on cloud, whole instance on self-hosted. Null when nothing counts the dimension.
  countUsage(orgId: string, dimensionKey: string): Promise<number | null>;
  // Never throws: the metered write already happened.
  emit(orgId: string, dimensionKey: string): void;
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

  async countUsage(orgId: string, dimensionKey: string): Promise<number | null> {
    const counter = this.deps.counters.get(dimensionKey);
    if (!counter) return null;
    return counter.count(this.deps.licenseService.getInstanceType() === InstanceType.Cloud ? orgId : null);
  }

  emit(orgId: string, dimensionKey: string): void {
    this.deps.usageQueue.emit(orgId, dimensionKey);
  }

  recordMeteringEvents(orgId: string, events: TMeteringEventInput[]): void {
    this.deps.usageQueue.recordMeteringEvents(orgId, events);
  }

  async syncSeats(orgId: string): Promise<void> {
    try {
      const rootOrgId = await this.deps.organizationsProjectsService.resolveRootOrgId(orgId);
      this.deps.usageQueue.emit(rootOrgId, Meter.UserIdentities.key);
      await this.deps.licenseService.refreshPlan(rootOrgId);
    } catch (error) {
      logger.error(error, `syncSeats: failed to sync seats [orgId=${orgId}]`);
    }
  }
}
