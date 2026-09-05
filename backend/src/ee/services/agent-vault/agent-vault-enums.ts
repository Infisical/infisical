export enum AgentVaultCredentialType {
  Bearer = "bearer",
  Basic = "basic",
  Passthrough = "passthrough"
}

export enum AgentVaultUnmatchedHost {
  Allow = "allow",
  Deny = "deny"
}

// Not a free-form duration: a fixed set keeps the Sessions page and the CLI honest about what a token
// can be, and `Never` is the one an admin needs to be able to spot at a glance.
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
