import { RuleViolationError } from "@app/domains/lib/errors";
import { Meter, TLicenseService, TUsageMeteringService } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";
import { logger } from "@app/lib/logger";

import { TAgentVaultUsageService, TRecordProxyUsageInput } from "../../../ce/services/dependencies";
import { TAgentVaultFreeUsageCache } from "../dependencies";

// A report the proxy dates further out than this means its clock is wrong, and the License Server would bill it to
// the wrong period. The proxy keeps unsent reports for a day, so a week back is plenty.
const MAX_REPORT_AHEAD_MS = 5 * 60_000;
const MAX_REPORT_AGE_MS = 7 * 24 * 60 * 60_000;

// Counts every brokered request on cloud toward the root org's free month, whatever its plan, and reports it to the
// License Server, which refuses or stores unbilled what an org's plan doesn't price. Self-hosted is never counted.
export class AgentVaultUsageService implements TAgentVaultUsageService {
  constructor(
    private readonly licenseService: Pick<TLicenseService, "getInstanceEntitlements">,
    private readonly usageMeteringService: Pick<TUsageMeteringService, "recordMeteringEvents">,
    private readonly organizationsProjectsService: Pick<TOrganizationsProjectsService, "resolveRootOrgId">,
    private readonly freeUsageCache: Pick<TAgentVaultFreeUsageCache, "claimReport" | "add">
  ) {}

  async recordProxyUsage({ orgId, reportId, endedAt, brokered }: TRecordProxyUsageInput): Promise<void> {
    const offsetMs = endedAt.getTime() - Date.now();
    if (offsetMs > MAX_REPORT_AHEAD_MS || -offsetMs > MAX_REPORT_AGE_MS) {
      throw new RuleViolationError({
        name: "AgentVaultUsageReportOutOfRange",
        message:
          "This proxy's clock is too far from Infisical's for its usage report to be recorded. Fix the clock on the machine running the proxy."
      });
    }
    if (brokered <= 0 || !this.licenseService.getInstanceEntitlements().isCloud()) return;

    if (!(await this.freeUsageCache.claimReport(reportId))) return;

    // The month is when Infisical received the report, not the proxy's endedAt, so a proxy's clock can't move usage
    // into another month.
    try {
      const rootOrgId = await this.organizationsProjectsService.resolveRootOrgId(orgId);
      await this.freeUsageCache.add(rootOrgId, new Date(), brokered);
    } catch (error) {
      // The report is claimed, so a resend would be ignored: still send it to metering rather than lose the bill.
      logger.error(error, `Failed to count Agent Vault free usage [orgId=${orgId}] [reportId=${reportId}]`);
    }

    // The proxy reuses reportId and endedAt when it resends, which is what the License Server dedupes on.
    this.usageMeteringService.recordMeteringEvents(orgId, [
      { eventId: reportId, meter: Meter.AgentVaultBrokeredRequests, quantity: brokered, occurredAt: endedAt }
    ]);
  }
}
