import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { PlanCache } from "../data-access/plan-cache";
import { TLicenseServerClient } from "../license-server-client/license-server-client";
import { Meter } from "../model/meter";
import { InstanceEntitlementsHolder } from "./instance-entitlements-holder";
import { OrganizationDirectory } from "./organization-directory";
import { PlanResolver } from "./plan-resolver";
import { UsageQueue } from "./usage-queue";

export type TSubscriptionServiceDeps = {
  instance: InstanceEntitlementsHolder;
  planCache: PlanCache;
  organizations: OrganizationDirectory;
  planResolver: PlanResolver;
  usageQueue: UsageQueue;
  licenseServerClient: TLicenseServerClient;
};

export class SubscriptionService {
  constructor(private readonly deps: TSubscriptionServiceDeps) {}

  // Call after the change to the org's members commits. Reports the new seat count and refreshes the plan,
  // which carries it. A failure is logged rather than thrown, since the change it follows has committed.
  async syncSeats(orgId: string): Promise<void> {
    try {
      const rootOrgId = await this.deps.organizations.rootOrgIdOf(orgId);
      this.deps.usageQueue.emit(rootOrgId, Meter.UserIdentities.key);
      await this.deps.planResolver.refresh(rootOrgId);
    } catch (error) {
      logger.error(error, `syncSeats: failed to sync seats [orgId=${orgId}]`);
    }
  }

  // Cloud only. An org with no subscription answers 4xx (a BadRequestError), which counts as cancelled; any
  // other failure is thrown so the caller can stop before deleting the org.
  async cancelSubscription(orgId: string): Promise<void> {
    if (!this.deps.instance.isCloud()) return;

    try {
      await this.deps.licenseServerClient.cancelSubscription(orgId);
    } catch (error) {
      if (!(error instanceof BadRequestError)) throw error;
      logger.info(`cancelOrgSubscription: no subscription to cancel [orgId=${orgId}]`);
    }
    await this.deps.planCache.invalidate(orgId);
  }
}
