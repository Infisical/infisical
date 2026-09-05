export enum AgentVaultCredentialType {
  Bearer = "bearer",
  Basic = "basic",
  Passthrough = "passthrough"
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
