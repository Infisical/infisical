import { AgentVaultFreeUsageThreshold } from "../../ce/models/agent-vault-access-state";

export type TAgentVaultFreeUsageCache = {
  // True the first time a report id is seen, false for a resend already counted.
  claimReport(reportId: string): Promise<boolean>;
  // Returns the month's count after adding.
  add(rootOrgId: string, at: Date, brokered: number): Promise<number>;
  // True the first time a root org passes a threshold in a month, so concurrent reports notify once.
  claimNotice(rootOrgId: string, at: Date, threshold: AgentVaultFreeUsageThreshold): Promise<boolean>;
  read(rootOrgId: string, at: Date): Promise<number>;
};
