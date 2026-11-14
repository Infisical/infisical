export enum AgentVaultAccessState {
  // Self-hosted is free and never counted.
  SelfHosted = "self-hosted",
  // The plan includes Agent Vault: bought, an Enterprise contract or an override.
  Plan = "plan",
  // The plan says nothing yet: before the switch exists in the License Server, or a fallback plan in an outage.
  Open = "open",
  // The plan says no, so the org brokers for free up to the monthly limit.
  Free = "free",
  LimitReached = "limit-reached"
}

export type TAgentVaultFreeUsageJSON = {
  used: number;
  limit: number;
  resetsAt: Date;
};

export type TAgentVaultAccessJSON = {
  state: AgentVaultAccessState;
  allowed: boolean;
  // Only for an org on the free tier whose count could be read.
  freeUsage: TAgentVaultFreeUsageJSON | null;
  warn: boolean;
};
