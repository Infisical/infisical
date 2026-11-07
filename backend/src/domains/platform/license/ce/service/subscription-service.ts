import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { UserIdentities } from "../model/metered-features";
import { emitUsage, isCloud, refreshPlanFor, rootOrgOf, TLicenseContext } from "./license-context";

export class SubscriptionService {
  constructor(private readonly ctx: TLicenseContext) {}

  // Call after the change to the org's members commits. Reports the new seat count and refreshes the plan,
  // which carries it. A failure is logged rather than thrown, since the change it follows has committed.
  async syncSeats(orgId: string): Promise<void> {
    try {
      const root = await rootOrgOf(this.ctx, orgId);
      const rootOrgId = root?.id ?? orgId;
      emitUsage(this.ctx, rootOrgId, UserIdentities.key);
      await refreshPlanFor(this.ctx, rootOrgId);
    } catch (error) {
      logger.error(error, `syncSeats: failed to sync seats [orgId=${orgId}]`);
    }
  }

  // Cloud only. An org with no subscription answers 4xx, which counts as cancelled; any other failure is
  // thrown so the caller can stop before deleting the org.
  async cancelSubscription(orgId: string): Promise<void> {
    if (!isCloud(this.ctx)) return;

    try {
      await this.ctx.hooks.cancelSubscription(orgId);
    } catch (error) {
      if (!(error instanceof BadRequestError)) throw error;
      logger.info(`cancelOrgSubscription: no subscription to cancel [orgId=${orgId}]`);
    }
    await this.ctx.state.planCache.invalidate(orgId);
  }
}
