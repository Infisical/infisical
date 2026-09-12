export enum AgentVaultCredentialType {
  Bearer = "bearer",
  Basic = "basic",
  Passthrough = "passthrough"
}

export enum AgentVaultTrafficPolicy {
  AnyHost = "any-host",
  BundleHosts = "bundle-hosts"
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
