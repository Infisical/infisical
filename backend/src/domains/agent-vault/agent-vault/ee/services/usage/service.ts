import { RuleViolationError } from "@app/domains/lib/errors";
import { Meter, TLicenseService, TUsageMeteringService } from "@app/domains/platform/license/ce/module";

import { TAgentVaultUsageService, TRecordProxyUsageInput } from "../../../ce/services/dependencies";

// A report the proxy dates further out than this means its clock is wrong, and the License Server would bill it to
// the wrong period. The proxy keeps unsent reports for a day, so a week back is plenty.
const MAX_REPORT_AHEAD_MS = 5 * 60_000;
const MAX_REPORT_AGE_MS = 7 * 24 * 60 * 60_000;

// Reports every brokered request on cloud and leaves pricing to the License Server, which refuses or stores
// unbilled what an org's plan doesn't price. Self-hosted is never metered.
export class AgentVaultUsageService implements TAgentVaultUsageService {
  constructor(
    private readonly licenseService: Pick<TLicenseService, "getInstanceEntitlements">,
    private readonly usageMeteringService: Pick<TUsageMeteringService, "recordMeteringEvents">
  ) {}

  recordProxyUsage({ orgId, reportId, endedAt, brokered }: TRecordProxyUsageInput): void {
    const offsetMs = endedAt.getTime() - Date.now();
    if (offsetMs > MAX_REPORT_AHEAD_MS || -offsetMs > MAX_REPORT_AGE_MS) {
      throw new RuleViolationError({
        name: "AgentVaultUsageReportOutOfRange",
        message:
          "This proxy's clock is too far from Infisical's for its usage report to be recorded. Fix the clock on the machine running the proxy."
      });
    }
    if (brokered <= 0 || !this.licenseService.getInstanceEntitlements().isCloud()) return;

    // The proxy reuses reportId and endedAt when it resends, which is what the License Server dedupes on.
    this.usageMeteringService.recordMeteringEvents(orgId, [
      { eventId: reportId, meter: Meter.AgentVaultBrokeredRequests, quantity: brokered, occurredAt: endedAt }
    ]);
  }
}
