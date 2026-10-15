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

export enum AgentVaultServiceType {
  Http = "http",
  Mcp = "mcp"
}

export enum AgentVaultMcpTransport {
  StreamableHttp = "streamable-http",
  Sse = "sse"
}

export enum AgentVaultCredentialType {
  Bearer = "bearer",
  Basic = "basic",
  Passthrough = "passthrough",
  OAuth = "oauth"
}

export enum AgentVaultOAuthStatus {
  Connected = "connected",
  NeedsReauthorization = "needs-reauthorization",
  NeedsAdditionalScopes = "needs-additional-scopes"
}

export enum AgentVaultOAuthAuthorizationStatus {
  Pending = "pending",
  Authorized = "authorized",
  Failed = "failed"
}

export enum AgentVaultMemberType {
  User = "user",
  MachineIdentity = "machineIdentity",
  Group = "group"
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

export enum AgentVaultSessionLogDecision {
  Brokered = "brokered",
  Passthrough = "passthrough",
  Blocked = "blocked",
  Error = "error"
}

/** Which value of a service uses a variable. A basic credential's password is its credential-value. */
export enum AgentVaultVariableReferenceField {
  CredentialValue = "credential-value",
  CredentialUsername = "credential-username",
  CustomHeader = "custom-header",
  Substitution = "substitution"
}
