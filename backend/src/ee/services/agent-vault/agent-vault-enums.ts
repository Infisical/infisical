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

export enum AgentVaultServiceType {
  Http = "http",
  Mcp = "mcp"
}

export enum AgentVaultMcpTransport {
  StreamableHttp = "streamable-http",
  Sse = "sse"
}

export enum AgentVaultMemberType {
  User = "user",
  MachineIdentity = "machineIdentity",
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

/** Which part of a service a variable reference sits in. A basic credential's password is its value. */
export enum AgentVaultVariableReferenceField {
  CredentialValue = "credential-value",
  CredentialUsername = "credential-username",
  CustomHeader = "custom-header",
  Substitution = "substitution"
}

export enum AgentVaultVariableScope {
  Global = "global",
  Personal = "personal"
}

/**
 * The fields an admin can leave to each member, named as variable references name them: `credential-value` is a
 * bearer token or a basic password, `credential-username` a basic username.
 */
export const AGENT_VAULT_MEMBER_PROVIDED_FIELDS = [
  AgentVaultVariableReferenceField.CredentialValue,
  AgentVaultVariableReferenceField.CredentialUsername
] as const;

export type TAgentVaultMemberProvidedField = (typeof AGENT_VAULT_MEMBER_PROVIDED_FIELDS)[number];
