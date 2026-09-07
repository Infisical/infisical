export enum AgentVaultCredentialType {
  Bearer = "bearer",
  Basic = "basic",
  Passthrough = "passthrough"
}

export enum AgentVaultResourceRole {
  Consumer = "consumer"
}

export enum AgentVaultUnmatchedHost {
  Allow = "allow",
  Deny = "deny"
}

export enum AgentVaultSessionTtl {
  OneHour = "1h",
  EightHours = "8h",
  OneDay = "24h",
  SevenDays = "7d",
  Never = "never"
}

export enum AgentVaultSessionStatus {
  Active = "active",
  Revoked = "revoked",
  Expired = "expired"
}

export enum AgentVaultSessionScope {
  Mine = "mine",
  All = "all"
}

export const AGENT_VAULT_SESSION_TTL_SECONDS: Record<AgentVaultSessionTtl, number | null> = {
  [AgentVaultSessionTtl.OneHour]: 60 * 60,
  [AgentVaultSessionTtl.EightHours]: 8 * 60 * 60,
  [AgentVaultSessionTtl.OneDay]: 24 * 60 * 60,
  [AgentVaultSessionTtl.SevenDays]: 7 * 24 * 60 * 60,
  [AgentVaultSessionTtl.Never]: null
};
