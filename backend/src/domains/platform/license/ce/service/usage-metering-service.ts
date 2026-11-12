import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";
import { logger } from "@app/lib/logger";

import { InstanceType } from "../model/instance-entitlements";
import { Meter } from "../model/meter";
import { CounterRegistry } from "./counter-registry";
import { TLicenseService } from "./license-service";
import { TMeteringEventInput, UsageQueue } from "./usage-queue";

export type TUsageMeteringService = {
  // The live count of a metered dimension for an org (on cloud) or the instance (self-hosted). Null when
  // nothing counts it.
  countUsage(orgId: string, dimensionKey: string): Promise<number | null>;
  // Queues a report of the dimension's count. Never throws: the metered write has already happened.
  emit(orgId: string, dimensionKey: string): void;
  recordMeteringEvents(orgId: string, events: TMeteringEventInput[]): void;
  // Reports the new seat count and refreshes the plan, which carries it. Call after the change to the org's
  // members commits. A failure is logged rather than thrown, since that change has committed.
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
