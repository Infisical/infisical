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

export enum AgentVaultOauthStatus {
  Connected = "connected",
  NeedsReauthorization = "needs-reauthorization",
  NeedsAdditionalScopes = "needs-additional-scopes"
}

export enum AgentVaultOauthAuthorizationStatus {
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
  ServiceHosts = "service-hosts",
  // The old name of service-hosts, which an API that predates the rename still returns.
  BundleHosts = "bundle-hosts"
}

export const isServiceHostsPolicy = (policy: AgentVaultTrafficPolicy | undefined) =>
  policy === AgentVaultTrafficPolicy.ServiceHosts || policy === AgentVaultTrafficPolicy.BundleHosts;

export enum AgentVaultSessionStatus {
  Active = "active",
  Revoked = "revoked",
  Expired = "expired"
}

export enum AgentVaultSessionScope {
  Mine = "mine",
  All = "all"
}

/** Which users a machine identity can start sessions on behalf of. */
export enum AgentVaultDelegationScope {
  AllMembers = "all-members",
  Selected = "selected"
}

/** Global variables are an admin's, for services; personal ones are the caller's own, for their personal values. */
export enum AgentVaultVariableScope {
  Global = "global",
  Personal = "personal"
}

export enum AgentVaultSessionLogDecision {
  Brokered = "brokered",
  Passthrough = "passthrough",
  Blocked = "blocked",
  Error = "error",
  // The agent asked for the services its session can use, which the proxy gets from Infisical for the session.
  Discovery = "discovery",
  // The session's skills, which the proxy gets from Infisical for the session.
  Skills = "skills"
}

// The name an agent reaches its session's services and skills at, through its proxy. No service can cover it.
export const AGENT_VAULT_RESERVED_HOST = "agent-vault.invalid";

// Infisical gives the built-in skill this fixed ID, so a skill sheet can tell it apart before anything loads.
export const AGENT_VAULT_BUILTIN_SKILL_ID = "8f1c2d4e-6a7b-4c3d-9e8f-0a1b2c3d4e5f";

/** Which value of a service uses a variable. A basic credential's password is its credential-value. */
export enum AgentVaultVariableReferenceField {
  CredentialValue = "credential-value",
  CredentialUsername = "credential-username",
  CustomHeader = "custom-header",
  Substitution = "substitution"
}

export enum AgentVaultSessionLogStorageType {
  Default = "default",
  External = "external"
}
