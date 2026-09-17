export enum AgentVaultCredentialType {
  Bearer = "bearer",
  Basic = "basic",
  Passthrough = "passthrough"
}

export enum AgentVaultMemberType {
  User = "user",
  Identity = "identity",
  Group = "group"
}

export enum AgentVaultResourceRole {
  Consumer = "consumer"
}

export enum AgentVaultHttpMethod {
  Get = "GET",
  Head = "HEAD",
  Post = "POST",
  Put = "PUT",
  Patch = "PATCH",
  Delete = "DELETE",
  Options = "OPTIONS"
}

export enum AgentVaultSubstitutionSurface {
  Path = "path",
  Query = "query",
  Header = "header",
  Body = "body"
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
