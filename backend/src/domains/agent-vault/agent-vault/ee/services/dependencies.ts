import { AgentVaultFreeUsageThreshold } from "../../ce/models/agent-vault-access-state";
import { UsageMonth } from "../models/usage-month";

export type TAgentVaultFreeUsageCache = {
  // True the first time a report id is seen, false for a resend already counted.
  claimReport(reportId: string): Promise<boolean>;
  // Returns the month's count after adding.
  add(rootOrgId: string, at: Date, brokered: number): Promise<number>;
  // Whether the month's notice for this threshold was already delivered.
  isNoticeSent(rootOrgId: string, month: UsageMonth, threshold: AgentVaultFreeUsageThreshold): Promise<boolean>;
  // True when this caller won the short lock to send the notice, so concurrent reports send it once.
  lockNotice(rootOrgId: string, month: UsageMonth, threshold: AgentVaultFreeUsageThreshold): Promise<boolean>;
  markNoticeSent(rootOrgId: string, month: UsageMonth, threshold: AgentVaultFreeUsageThreshold): Promise<void>;
  releaseNotice(rootOrgId: string, month: UsageMonth, threshold: AgentVaultFreeUsageThreshold): Promise<void>;
  read(rootOrgId: string, at: Date): Promise<number>;
};
