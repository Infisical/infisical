import type { TDomainKeyStore } from "@app/domains/lib/key-store";

import { UsageMonth } from "../models/usage-month";
import { TAgentVaultFreeUsageCache } from "../services/dependencies";

const FreeUsageKeys = {
  report: (reportId: string) => `agent-vault-usage-report-${reportId}`,
  month: (rootOrgId: string, month: UsageMonth) => `agent-vault-free-usage-${rootOrgId}-${month.key}`
};

// A proxy resends an unacknowledged report within minutes.
const REPORT_CLAIM_TTL_IN_SECONDS = 600;
// A day past the month's end, so pods whose clocks disagree near midnight UTC still find the month's count.
const MONTH_GRACE_IN_SECONDS = 86400;

export class FreeUsageCache implements TAgentVaultFreeUsageCache {
  constructor(private readonly keyStore: TDomainKeyStore) {}

  async claimReport(reportId: string): Promise<boolean> {
    const claimed = await this.keyStore.setItemWithExpiryNX(
      FreeUsageKeys.report(reportId),
      REPORT_CLAIM_TTL_IN_SECONDS,
      "1"
    );
    return claimed === "OK";
  }

  async add(rootOrgId: string, at: Date, brokered: number): Promise<void> {
    const month = UsageMonth.of(at);
    await this.keyStore.incrementByWithExpiry(
      FreeUsageKeys.month(rootOrgId, month),
      brokered,
      month.secondsUntilReset(at) + MONTH_GRACE_IN_SECONDS
    );
  }

  async read(rootOrgId: string, at: Date): Promise<number> {
    const raw = await this.keyStore.getItem(FreeUsageKeys.month(rootOrgId, UsageMonth.of(at)));
    return raw === null ? 0 : Number(raw);
  }
}
