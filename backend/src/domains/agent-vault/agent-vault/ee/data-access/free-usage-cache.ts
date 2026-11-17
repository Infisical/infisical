import type { TDomainKeyStore } from "@app/domains/lib/key-store";

import { AgentVaultFreeUsageThreshold } from "../../ce/models/agent-vault-access-state";
import { UsageMonth } from "../models/usage-month";
import { TAgentVaultFreeUsageCache } from "../services/dependencies";

const FreeUsageKeys = {
  report: (reportId: string) => `agent-vault-usage-report-${reportId}`,
  month: (rootOrgId: string, month: UsageMonth) => `agent-vault-free-usage-${rootOrgId}-${month.key}`,
  notice: (rootOrgId: string, month: UsageMonth, threshold: AgentVaultFreeUsageThreshold) =>
    `agent-vault-free-usage-notice-${rootOrgId}-${month.key}-${threshold}`
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

  async add(rootOrgId: string, at: Date, brokered: number): Promise<number> {
    const month = UsageMonth.of(at);
    return this.keyStore.incrementByWithExpiry(
      FreeUsageKeys.month(rootOrgId, month),
      brokered,
      month.secondsUntilReset(at) + MONTH_GRACE_IN_SECONDS
    );
  }

  async claimNotice(rootOrgId: string, at: Date, threshold: AgentVaultFreeUsageThreshold): Promise<boolean> {
    const month = UsageMonth.of(at);
    const claimed = await this.keyStore.setItemWithExpiryNX(
      FreeUsageKeys.notice(rootOrgId, month, threshold),
      month.secondsUntilReset(at) + MONTH_GRACE_IN_SECONDS,
      "1"
    );
    return claimed === "OK";
  }

  async read(rootOrgId: string, at: Date): Promise<number> {
    const raw = await this.keyStore.getItem(FreeUsageKeys.month(rootOrgId, UsageMonth.of(at)));
    return raw === null ? 0 : Number(raw);
  }
}
