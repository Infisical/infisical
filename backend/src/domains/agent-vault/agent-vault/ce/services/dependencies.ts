import { AgentVaultAccessState, TAgentVaultAccessJSON } from "../models/agent-vault-access-state";

// Agent Vault billing is EE (ee/), so other code reaches it only through these types.
export type TAgentVaultAccessDecision = {
  readonly allowed: boolean;
  readonly state: AgentVaultAccessState;
  readonly showCardModal: boolean;
  // Throws a RuleViolationError named AgentVaultNotOnPlan, which the CLI and the UI key on.
  assertAllowed(): void;
  toJSON(): TAgentVaultAccessJSON;
};

export type TAgentVaultAccessService = {
  // For calls the proxy makes on every poll: reads no table unless the plan says no, and never writes.
  assertCanBroker(orgId: string): Promise<void>;
  // For people: also ends grandfathering once the org has bought Agent Vault.
  getAccess(orgId: string): Promise<TAgentVaultAccessDecision>;
};

export type TRecordProxyUsageInput = {
  orgId: string;
  reportId: string;
  endedAt: Date;
  brokered: number;
};

export type TAgentVaultUsageService = {
  recordProxyUsage(input: TRecordProxyUsageInput): void;
};
