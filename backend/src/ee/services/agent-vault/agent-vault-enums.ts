export enum AgentVaultCredentialType {
  Bearer = "bearer",
  Basic = "basic",
  Passthrough = "passthrough",
  OAuth = "oauth",
  SshKey = "ssh-key"
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
  Mcp = "mcp",
  Postgres = "postgres",
  Mysql = "mysql",
  Ssh = "ssh"
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

export type TAgentVaultActorColumn = "actorUserId" | "actorIdentityId" | "actorGroupId";

// The `memberships` column that holds each member type's actor id.
export const AGENT_VAULT_ACTOR_COLUMN: Record<AgentVaultMemberType, TAgentVaultActorColumn> = {
  [AgentVaultMemberType.User]: "actorUserId",
  [AgentVaultMemberType.MachineIdentity]: "actorIdentityId",
  [AgentVaultMemberType.Group]: "actorGroupId"
};

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
  ServiceHosts = "service-hosts",
  // The old name of service-hosts. Still accepted, still what is stored, and still what proxies are sent: a released
  // CLI only blocks under this value and lets every host through under one it doesn't know.
  BundleHosts = "bundle-hosts"
}

// What a proxy's traffic policy is stored as, and sent to proxies as, until every CLI in use knows service-hosts.
export const toStoredTrafficPolicy = (policy: AgentVaultTrafficPolicy) =>
  policy === AgentVaultTrafficPolicy.ServiceHosts ? AgentVaultTrafficPolicy.BundleHosts : policy;

// What the admin API and the UI call it.
export const toTrafficPolicyView = (policy: AgentVaultTrafficPolicy) =>
  policy === AgentVaultTrafficPolicy.BundleHosts ? AgentVaultTrafficPolicy.ServiceHosts : policy;

export enum AgentVaultSessionStatus {
  Active = "active",
  Revoked = "revoked",
  Expired = "expired"
}

export enum AgentVaultSessionScope {
  Mine = "mine",
  All = "all"
}

/** Which users a machine identity may start sessions on behalf of. */
export enum AgentVaultDelegationScope {
  AllMembers = "all-members",
  Selected = "selected"
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
