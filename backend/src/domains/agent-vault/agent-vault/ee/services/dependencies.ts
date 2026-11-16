export type TAgentVaultFreeUsageCache = {
  // True the first time a report id is seen, false for a resend already counted.
  claimReport(reportId: string): Promise<boolean>;
  add(rootOrgId: string, at: Date, brokered: number): Promise<void>;
  read(rootOrgId: string, at: Date): Promise<number>;
};
