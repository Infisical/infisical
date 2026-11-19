import { RuleViolationError } from "@app/domains/lib/errors";
import { Meter, TLicenseService, TUsageMeteringService } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";
import { logger } from "@app/lib/logger";

import { AgentVaultFreeUsageThreshold } from "../../../ce/models/agent-vault-access-state";
import {
  TAgentVaultFreeUsageCrossing,
  TAgentVaultUsageService,
  TRecordProxyUsageInput
} from "../../../ce/services/dependencies";
import { AgentVaultAccess } from "../../models/agent-vault-access";
import { UsageMonth } from "../../models/usage-month";
import { TAgentVaultFreeUsageCache } from "../dependencies";

// A report the proxy dates further out than this means its clock is wrong, and the License Server would bill it to
// the wrong period. The proxy keeps unsent reports for a day, so a week back is plenty.
const MAX_REPORT_AHEAD_MS = 5 * 60_000;
const MAX_REPORT_AGE_MS = 7 * 24 * 60 * 60_000;

// Counts every brokered request on cloud toward the root org's free month, whatever its plan, and reports it to the
// License Server, which refuses or stores unbilled what an org's plan doesn't price. Self-hosted is never counted.
export class AgentVaultUsageService implements TAgentVaultUsageService {
  constructor(
    private readonly licenseService: Pick<TLicenseService, "getInstanceEntitlements" | "getPlan">,
    private readonly usageMeteringService: Pick<TUsageMeteringService, "recordMeteringEvents">,
    private readonly organizationsProjectsService: Pick<TOrganizationsProjectsService, "resolveRootOrgId">,
    private readonly freeUsageCache: Pick<
      TAgentVaultFreeUsageCache,
      "claimReport" | "add" | "isNoticeSent" | "lockNotice" | "markNoticeSent" | "releaseNotice"
    >
  ) {}

  async recordProxyUsage({
    orgId,
    reportId,
    endedAt,
    brokered
  }: TRecordProxyUsageInput): Promise<TAgentVaultFreeUsageCrossing[]> {
    if (brokered <= 0 || !this.licenseService.getInstanceEntitlements().isCloud()) return [];

    const offsetMs = endedAt.getTime() - Date.now();
    if (-offsetMs > MAX_REPORT_AGE_MS) {
      throw new RuleViolationError({
        name: "AgentVaultUsageReportOutOfRange",
        message:
          "This proxy's clock is too far from Infisical's for its usage report to be recorded. Fix the clock on the machine running the proxy."
      });
    }

    if (!(await this.freeUsageCache.claimReport(reportId))) return [];

    // The month is when Infisical received the report, not the proxy's endedAt, so a proxy's clock can't move usage
    // into another month.
    let crossings: TAgentVaultFreeUsageCrossing[] = [];
    try {
      const rootOrgId = await this.organizationsProjectsService.resolveRootOrgId(orgId);
      const receivedAt = new Date();
      const used = await this.freeUsageCache.add(rootOrgId, receivedAt, brokered);
      crossings = await this.claimPendingNotices(rootOrgId, receivedAt, used).catch((error) => {
        // A missed notice never blocks counting or billing.
        logger.error(error, `Failed to check Agent Vault free usage notices [rootOrgId=${rootOrgId}]`);
        return [];
      });
    } catch (error) {
      // The report is claimed, so a resend would be ignored: still send it to metering rather than lose the bill.
      logger.error(error, `Failed to count Agent Vault free usage [orgId=${orgId}] [reportId=${reportId}]`);
    }

    // The proxy reuses reportId and endedAt when it resends, which is what the License Server dedupes on. A proxy
    // whose clock runs ahead is billed at Infisical's time, since the License Server refuses usage dated in the future.
    const occurredAt = offsetMs > MAX_REPORT_AHEAD_MS ? new Date() : endedAt;
    this.usageMeteringService.recordMeteringEvents(orgId, [
      { eventId: reportId, meter: Meter.AgentVaultBrokeredRequests, quantity: brokered, occurredAt }
    ]);
    return crossings;
  }

  async completeNotice(crossing: TAgentVaultFreeUsageCrossing): Promise<void> {
    await this.freeUsageCache.markNoticeSent(
      crossing.rootOrgId,
      UsageMonth.fromKey(crossing.month),
      crossing.threshold
    );
  }

  async releaseNotice(crossing: TAgentVaultFreeUsageCrossing): Promise<void> {
    await this.freeUsageCache.releaseNotice(crossing.rootOrgId, UsageMonth.fromKey(crossing.month), crossing.threshold);
  }

  // Every request is counted whatever the plan, so only an org the free tier limits gets a notice. A notice is due
  // whenever the count is past a threshold and that notice wasn't delivered yet this month, not only on the report
  // that crossed it, so one missed while the plan allowed (a trial, a License Server outage) or while delivery failed
  // goes out on a later report. Below the warning nothing is read; past it, one key read per threshold, and the plan
  // only while a notice is still due.
  private async claimPendingNotices(
    rootOrgId: string,
    at: Date,
    used: number
  ): Promise<TAgentVaultFreeUsageCrossing[]> {
    // Past the limit the warning is out of date, and leaving it out here rather than when sending keeps a concurrent
    // report that locks only the warning from sending it beside the limit notice.
    const thresholds = AgentVaultAccess.thresholdsReached(used);
    const reached = thresholds.includes(AgentVaultFreeUsageThreshold.Limit)
      ? [AgentVaultFreeUsageThreshold.Limit]
      : thresholds;
    if (!reached.length) return [];

    const month = UsageMonth.of(at);
    const sent = await Promise.all(
      reached.map((threshold) => this.freeUsageCache.isNoticeSent(rootOrgId, month, threshold))
    );
    const due = reached.filter((_, index) => !sent[index]);
    if (!due.length) return [];

    const plan = await this.licenseService.getPlan(rootOrgId);
    if (!AgentVaultAccess.isLimited({ isCloud: true, plan })) return [];

    // Checked again once locked: another report may have sent it and freed the lock since the read above. Its sender
    // writes the sent key before deleting the lock, so this read sees it.
    const locked = await Promise.all(
      due.map(async (threshold) => {
        if (!(await this.freeUsageCache.lockNotice(rootOrgId, month, threshold))) return null;
        if (await this.freeUsageCache.isNoticeSent(rootOrgId, month, threshold)) {
          await this.freeUsageCache.releaseNotice(rootOrgId, month, threshold);
          return null;
        }
        return threshold;
      })
    );
    return locked
      .filter((threshold) => threshold !== null)
      .map((threshold) => ({
        rootOrgId,
        threshold,
        percent: AgentVaultAccess.thresholdPercent(threshold),
        month: month.key,
        limit: AgentVaultAccess.freeMonthlyLimit,
        resetsAt: month.resetsAt
      }));
  }
}
