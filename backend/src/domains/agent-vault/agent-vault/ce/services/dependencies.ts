import {
  AgentVaultAccessState,
  AgentVaultFreeUsageThreshold,
  TAgentVaultAccessJSON,
  TAgentVaultFreeUsageJSON
} from "../models/agent-vault-access-state";

// Agent Vault billing is EE (ee/), so other code reaches it only through these types.
export type TAgentVaultAccessDecision = {
  readonly allowed: boolean;
  readonly state: AgentVaultAccessState;
  readonly freeUsage: TAgentVaultFreeUsageJSON | null;
  readonly warn: boolean;
  // Throws a RuleViolationError named AgentVaultFreeLimitReached, which the CLI keys on.
  assertAllowed(): void;
  toJSON(): TAgentVaultAccessJSON;
};

export type TAgentVaultAccessService = {
  // For calls the proxy makes on every poll: reads the free count only when the plan says no.
  assertCanBroker(orgId: string): Promise<void>;
  // For the UI. Reads only.
  getAccess(orgId: string): Promise<TAgentVaultAccessDecision>;
};

export type TRecordProxyUsageInput = {
  orgId: string;
  reportId: string;
  endedAt: Date;
  brokered: number;
};

// A free-tier root org's count at or past a notice threshold this month, with no notice sent yet. Whoever is handed
// one holds a short lock on it and must call `completeNotice` once the notice is delivered, or `releaseNotice` if it
// failed, so a later report retries.
export type TAgentVaultFreeUsageCrossing = {
  rootOrgId: string;
  threshold: AgentVaultFreeUsageThreshold;
  // The threshold as a whole percent of the free requests.
  percent: number;
  // YYYY-MM, UTC.
  month: string;
  limit: number;
  resetsAt: Date;
};

export type TAgentVaultUsageService = {
  recordProxyUsage(input: TRecordProxyUsageInput): Promise<TAgentVaultFreeUsageCrossing[]>;
  completeNotice(crossing: TAgentVaultFreeUsageCrossing): Promise<void>;
  releaseNotice(crossing: TAgentVaultFreeUsageCrossing): Promise<void>;
};
