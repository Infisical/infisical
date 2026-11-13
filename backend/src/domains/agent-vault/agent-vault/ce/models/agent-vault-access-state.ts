export enum AgentVaultAccessState {
  // Self-hosted is free and never gated.
  SelfHosted = "self-hosted",
  // The plan includes Agent Vault: bought, an Enterprise contract or an override.
  Plan = "plan",
  // The plan says nothing yet: before the switch exists in the License Server, or a fallback plan in an outage.
  Open = "open",
  // Used Agent Vault before billing launched and hasn't bought it since.
  Grandfathered = "grandfathered",
  None = "none"
}

export type TAgentVaultAccessJSON = {
  allowed: boolean;
  state: AgentVaultAccessState;
  showCardModal: boolean;
};
