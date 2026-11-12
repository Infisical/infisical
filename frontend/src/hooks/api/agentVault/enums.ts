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
  Mcp = "mcp",
  Postgres = "postgres",
  Mysql = "mysql",
  Ssh = "ssh"
}

export type TAgentVaultNativeServiceType =
  | AgentVaultServiceType.Postgres
  | AgentVaultServiceType.Mysql
  | AgentVaultServiceType.Ssh;

export const AGENT_VAULT_NATIVE_SERVICE_TYPES: readonly TAgentVaultNativeServiceType[] = [
  AgentVaultServiceType.Postgres,
  AgentVaultServiceType.Mysql,
  AgentVaultServiceType.Ssh
];

export const isNativeServiceType = (
  type: AgentVaultServiceType | null | undefined
): type is TAgentVaultNativeServiceType =>
  (
    AGENT_VAULT_NATIVE_SERVICE_TYPES as readonly (AgentVaultServiceType | null | undefined)[]
  ).includes(type);

export const AGENT_VAULT_NATIVE_DEFAULT_PORTS: Record<TAgentVaultNativeServiceType, number> = {
  [AgentVaultServiceType.Postgres]: 5432,
  [AgentVaultServiceType.Mysql]: 3306,
  [AgentVaultServiceType.Ssh]: 22
};

export enum AgentVaultMcpTransport {
  StreamableHttp = "streamable-http",
  Sse = "sse"
}

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
