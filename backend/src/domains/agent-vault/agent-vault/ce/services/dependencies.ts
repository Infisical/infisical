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

// A free-tier root org's count passing a notice threshold this month. Each is returned once per org, month and
// threshold, so whoever sends the notice never has to dedupe.
export type TAgentVaultFreeUsageCrossing = {
  rootOrgId: string;
  threshold: AgentVaultFreeUsageThreshold;
  // YYYY-MM, UTC.
  month: string;
  limit: number;
  resetsAt: Date;
};

export type TAgentVaultUsageService = {
  recordProxyUsage(input: TRecordProxyUsageInput): Promise<TAgentVaultFreeUsageCrossing[]>;
};
