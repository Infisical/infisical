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

export enum AgentVaultSessionStatus {
  Active = "active",
  Revoked = "revoked",
  Expired = "expired"
}

export enum AgentVaultSessionScope {
  Mine = "mine",
  All = "all"
}
