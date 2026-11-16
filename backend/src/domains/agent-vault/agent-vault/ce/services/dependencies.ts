import {
  AgentVaultAccessState,
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

export type TAgentVaultUsageService = {
  recordProxyUsage(input: TRecordProxyUsageInput): Promise<void>;
};
