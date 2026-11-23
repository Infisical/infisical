import {
  AgentVaultCredentialType,
  AgentVaultDelegationScope,
  AgentVaultHttpMethod,
  AgentVaultMcpTransport,
  AgentVaultMemberType,
  AgentVaultOauthAuthorizationStatus,
  AgentVaultOauthClientAuthMethod,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  AgentVaultSessionLogDecision,
  AgentVaultSessionLogStorageType,
  AgentVaultSessionScope,
  AgentVaultSessionStatus,
  AgentVaultSubstitutionSurface,
  AgentVaultTrafficPolicy,
  AgentVaultVariableReferenceField,
  AgentVaultVariableScope,
  AgentVaultVariableType
} from "./enums";

/** A field an admin can leave to each member: a bearer token or basic password, or a basic username. */
export type TAgentVaultMemberProvidedField =
  | AgentVaultVariableReferenceField.CredentialValue
  | AgentVaultVariableReferenceField.CredentialUsername;

export type TAgentVaultBearerMemberField = AgentVaultVariableReferenceField.CredentialValue;

export type TAgentVaultOauthRegistration = "manual" | "dynamic";

export type TAgentVaultOauthCredentialSource = "service" | "member" | "variable";

// With the sign-in left to each member, the service holds no tokens of its own, so it has no status.
export type TAgentVaultOauthCredentialSummary = {
  type: AgentVaultCredentialType.OAuth;
  source: TAgentVaultOauthCredentialSource;
  memberProvidedFields: TAgentVaultBearerMemberField[];
  // The OAuth variable a service signs in with. Left out for whoever can't read variables.
  variable?: { id: string; key: string };
  status?: AgentVaultOauthStatus;
  issuer?: string;
  grantedScopes: string[];
  requiredScopes: string[];
  // Left out for Agent Vault members.
  expiresAt?: string | null;
  authorizedAt?: string | null;
  lastError?: string | null;
  // Only when each member signs in: the client every member signs in with.
  registration?: TAgentVaultOauthRegistration;
  clientId?: string | null;
};

export type TAgentVaultSharedOauthCredentialSummary = TAgentVaultOauthCredentialSummary & {
  status: AgentVaultOauthStatus;
};
export type TAgentVaultBasicMemberField = TAgentVaultMemberProvidedField;

export type TAgentVaultCredentialSummary =
  | {
      type: AgentVaultCredentialType.Bearer;
      headerName: string;
      headerPrefix: string;
      memberProvidedFields: TAgentVaultBearerMemberField[];
    }
  | { type: AgentVaultCredentialType.Basic; memberProvidedFields: TAgentVaultBasicMemberField[] }
  | { type: AgentVaultCredentialType.Passthrough }
  | { type: AgentVaultCredentialType.SshKey; hasCertificate: boolean }
  | TAgentVaultOauthCredentialSummary;

// The admin's own sign-in (authorizationId), an OAuth variable's (variable, by key) or, with memberProvidedFields, a
// sign-in left to each member, who all sign in with the client set here (or one registered automatically).
export type TAgentVaultOauthCredentialInput = {
  type: AgentVaultCredentialType.OAuth;
  authorizationId?: string;
  variable?: string;
  memberProvidedFields?: TAgentVaultBearerMemberField[];
  clientId?: string;
  clientSecret?: string;
  registration?: "dynamic";
};

// A member-provided field is sent without a value: each member sets their own.
export type TAgentVaultCredentialInput =
  | {
      type: AgentVaultCredentialType.Bearer;
      headerName?: string;
      headerPrefix?: string;
      value?: string;
      memberProvidedFields?: TAgentVaultBearerMemberField[];
    }
  | {
      type: AgentVaultCredentialType.Basic;
      username?: string;
      password?: string;
      memberProvidedFields?: TAgentVaultBasicMemberField[];
    }
  | { type: AgentVaultCredentialType.Passthrough };

export type TAgentVaultCredentialUpdate =
  | TAgentVaultCredentialInput
  | TAgentVaultOauthCredentialInput;

export type TAgentVaultBasicCredentialInput = Extract<
  TAgentVaultCredentialInput,
  { type: AgentVaultCredentialType.Basic }
>;

export type TAgentVaultSshKeyCredentialInput = {
  type: AgentVaultCredentialType.SshKey;
  username: string;
  privateKey: string;
  certificate?: string;
};

// Omitted fields keep what is stored; `certificate: null` removes it.
export type TAgentVaultSshKeyCredentialUpdate = {
  type: AgentVaultCredentialType.SshKey;
  username?: string;
  privateKey?: string;
  certificate?: string | null;
};

export type TAgentVaultNativeTls = { enabled: boolean; verify: boolean; ca: string | null };

// `ca: null` removes a stored certificate authority.
export type TAgentVaultNativeTlsInput = { enabled?: boolean; verify?: boolean; ca?: string | null };

export type TAgentVaultCustomHeaderSummary = { id: string; name: string; prefix: string };

export type TAgentVaultSubstitutionSummary = {
  id: string;
  placeholder: string;
  surfaces: AgentVaultSubstitutionSurface[];
};

/** `id` is optional because the API matches a row by name (or placeholder) when one is not sent, and
 * `value` is optional because omitting it keeps whatever is already stored for that row. */
export type TAgentVaultCustomHeaderInput = {
  id?: string;
  name: string;
  prefix?: string;
  value?: string;
};

export type TAgentVaultSubstitutionInput = {
  id?: string;
  placeholder: string;
  surfaces: AgentVaultSubstitutionSurface[];
  value?: string;
};

export type TAgentVaultVariableReference = {
  variableId: string;
  key: string;
} & (
  | {
      field:
        | AgentVaultVariableReferenceField.CredentialValue
        | AgentVaultVariableReferenceField.CredentialUsername;
    }
  | { field: AgentVaultVariableReferenceField.CustomHeader; customHeaderId: string }
  | { field: AgentVaultVariableReferenceField.Substitution; substitutionId: string }
);

// Each type carries only its own fields. A database or SSH service is reached by name, so it has no host pattern.
export type TAgentVaultServiceConfig =
  | {
      type: AgentVaultServiceType.Http;
      hostPattern: string;
      // null means unrestricted.
      allowedMethods: AgentVaultHttpMethod[] | null;
      allowedPathPrefixes: string[] | null;
    }
  | {
      type: AgentVaultServiceType.Mcp;
      serverUrl: string;
      transport: AgentVaultMcpTransport;
      hostPattern: string;
      // null means every tool.
      allowedTools: string[] | null;
    }
  | {
      type: AgentVaultServiceType.Postgres | AgentVaultServiceType.Mysql;
      host: string;
      port: number;
      database: string;
      tls: TAgentVaultNativeTls;
    }
  | {
      type: AgentVaultServiceType.Ssh;
      host: string;
      port: number;
    };

type TAgentVaultServiceConfigOf<T extends AgentVaultServiceType> = Extract<
  TAgentVaultServiceConfig,
  { type: T }
>;

type TAgentVaultCredentialSummaryOf<T extends AgentVaultCredentialType> = Extract<
  TAgentVaultCredentialSummary,
  { type: T }
>;

// Each type carries only the credentials it accepts and the transformations it applies: custom headers on HTTP and
// MCP services, substitutions on HTTP services.
export type TAgentVaultService = (
  | (TAgentVaultServiceConfigOf<AgentVaultServiceType.Http> & {
      // OAuth only through an OAuth variable.
      credential: TAgentVaultCredentialSummaryOf<
        | AgentVaultCredentialType.Bearer
        | AgentVaultCredentialType.Basic
        | AgentVaultCredentialType.Passthrough
        | AgentVaultCredentialType.OAuth
      >;
      customHeaders: TAgentVaultCustomHeaderSummary[];
      substitutions: TAgentVaultSubstitutionSummary[];
    })
  | (TAgentVaultServiceConfigOf<AgentVaultServiceType.Mcp> & {
      credential: TAgentVaultCredentialSummaryOf<
        AgentVaultCredentialType.Bearer | AgentVaultCredentialType.OAuth
      >;
      customHeaders: TAgentVaultCustomHeaderSummary[];
    })
  | (TAgentVaultServiceConfigOf<AgentVaultServiceType.Postgres | AgentVaultServiceType.Mysql> & {
      credential: TAgentVaultCredentialSummaryOf<AgentVaultCredentialType.Basic>;
    })
  | (TAgentVaultServiceConfigOf<AgentVaultServiceType.Ssh> & {
      credential: TAgentVaultCredentialSummaryOf<
        AgentVaultCredentialType.Basic | AgentVaultCredentialType.SshKey
      >;
    })
) & {
  id: string;
  name: string;
  description: string | null;
  // Left out for a member, who can't see variables.
  variableReferences?: TAgentVaultVariableReference[];
  // The caller's own values, on reads only. null when the admin sets the whole credential.
  personalValues?: TAgentVaultPersonalValues | null;
  // Left out for a caller who can't read hooks.
  hook?: TAgentVaultServiceHook | null;
  createdAt: string;
  updatedAt: string;
};

export type TAgentVaultBundleRef = { id: string; name: string };

// A service or skill in an add request that was already in the access bundle.
export type TAgentVaultSkippedBundleItem = { id: string; name: string };

// A service read from the project, with the access bundles it is in. A member gets only the ones they reach.
export type TAgentVaultProjectService = TAgentVaultService & {
  accessBundles: TAgentVaultBundleRef[];
};

export type TAgentVaultActor =
  | {
      type: AgentVaultMemberType.User;
      id: string;
      username: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    }
  | { type: AgentVaultMemberType.MachineIdentity; id: string; name: string }
  | { type: AgentVaultMemberType.Group; id: string; name: string };

export type TAgentVaultActorRef = { type: AgentVaultMemberType; id: string };

export type TAgentVaultMember = (
  | (Extract<TAgentVaultActor, { type: AgentVaultMemberType.User }> & {
      isOrgMembershipPending: boolean;
    })
  | Exclude<TAgentVaultActor, { type: AgentVaultMemberType.User }>
) & { grantedAt: string };

export type TAgentVaultProductActor =
  | (Extract<TAgentVaultActor, { type: AgentVaultMemberType.User }> & {
      isOrgMembershipPending: boolean;
    })
  | (Extract<TAgentVaultActor, { type: AgentVaultMemberType.MachineIdentity }> & {
      isManagedByAgentVault: boolean;
      orgId: string | null;
    })
  | Extract<TAgentVaultActor, { type: AgentVaultMemberType.Group }>;

export type TAgentVaultProductMember = TAgentVaultProductActor & {
  role: string;
  isActive: boolean;
  addedAt: string;
};

export type TAgentVaultProductMemberOf<T extends AgentVaultMemberType> = Extract<
  TAgentVaultProductMember,
  { type: T }
>;

export type TListAgentVaultProxiesDTO = {
  search?: string;
  orderBy?: "name" | "createdAt";
  orderDirection?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type TListAgentVaultAccessBundlesDTO = Omit<TListAgentVaultProxiesDTO, "orderBy"> & {
  orderBy?: "name" | "serviceCount" | "createdAt";
  /** Only the bundles the caller reaches that still require their personal values. */
  requiresSetup?: boolean;
  /** Only the bundles granted to the caller, or with false, only those an admin reaches by role. */
  granted?: boolean;
};

export type TListAgentVaultVariablesDTO = {
  scope?: AgentVaultVariableScope;
  type?: AgentVaultVariableType;
  search?: string;
  /** Exact keys. A key that doesn't exist is left out of the response. */
  keys?: string[];
  orderBy?: "key" | "serviceCount";
  orderDirection?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type TListAgentVaultMembersDTO = {
  actorType?: AgentVaultMemberType;
  search?: string;
  limit?: number;
  offset?: number;
};

export type TAgentVaultActorIdsDTO = {
  userIds?: string[];
  groupIds?: string[];
  machineIdentityIds?: string[];
};

export type TAddAgentVaultProductMembersDTO = TAgentVaultActorIdsDTO & {
  emails?: string[];
  role: string;
};

export type TUpdateAgentVaultMemberRolesDTO = TAgentVaultActorIdsDTO & { role: string };

export type TAgentVaultWrittenMember = TAgentVaultActorRef & { role: string; addedAt: string };

export type TAgentVaultGrantedMember = TAgentVaultActorRef & { grantedAt: string };

export type TAgentVaultMemberWriteResult<TMember, TSkipped = TAgentVaultActorRef> = {
  members: TMember[];
  skipped: TSkipped[];
};

export type TAgentVaultAccessBundle = {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TAgentVaultAccessBundleListItem = TAgentVaultAccessBundle & {
  serviceCount: number;
  memberCount: number;
  hostPatterns: string[];
  // Database and SSH services, which cover no host pattern.
  nativeServices: { name: string; type: AgentVaultServiceType }[];
  servicesRequiringSetup: { id: string; name: string }[];
};

export type TAgentVaultAccessBundleDetails = TAgentVaultAccessBundle & {
  services: TAgentVaultService[];
};

export type TAgentVaultSessionAccessBundle = {
  id: string | null;
  name: string;
};

type TAgentVaultInlineCredentialSummary =
  | { type: AgentVaultCredentialType.Bearer; headerName: string; headerPrefix: string }
  | { type: AgentVaultCredentialType.Basic }
  | { type: AgentVaultCredentialType.Passthrough }
  | { type: AgentVaultCredentialType.SshKey; hasCertificate: boolean };

type TAgentVaultInlineCredentialSummaryOf<T extends AgentVaultCredentialType> = Extract<
  TAgentVaultInlineCredentialSummary,
  { type: T }
>;

type TAgentVaultInlineCustomHeaderSummary = { name: string; prefix: string };

/** A service an admin sent with the session itself. Its secrets are never returned. */
export type TAgentVaultSessionInlineService = (
  | (TAgentVaultServiceConfigOf<AgentVaultServiceType.Http> & {
      credential: TAgentVaultInlineCredentialSummaryOf<
        | AgentVaultCredentialType.Bearer
        | AgentVaultCredentialType.Basic
        | AgentVaultCredentialType.Passthrough
      >;
      customHeaders: TAgentVaultInlineCustomHeaderSummary[];
      substitutions: { placeholder: string; surfaces: AgentVaultSubstitutionSurface[] }[];
    })
  | (TAgentVaultServiceConfigOf<AgentVaultServiceType.Mcp> & {
      credential: TAgentVaultInlineCredentialSummaryOf<AgentVaultCredentialType.Bearer>;
      customHeaders: TAgentVaultInlineCustomHeaderSummary[];
    })
  | (TAgentVaultServiceConfigOf<AgentVaultServiceType.Postgres | AgentVaultServiceType.Mysql> & {
      credential: TAgentVaultInlineCredentialSummaryOf<AgentVaultCredentialType.Basic>;
    })
  | (TAgentVaultServiceConfigOf<AgentVaultServiceType.Ssh> & {
      credential: TAgentVaultInlineCredentialSummaryOf<
        AgentVaultCredentialType.Basic | AgentVaultCredentialType.SshKey
      >;
    })
) & {
  id: string;
  // The name it was sent with, or its first host when it was sent without one.
  name: string;
  description: string | null;
  // Left out for a caller who can't read hooks.
  hook?: TAgentVaultServiceHook | null;
};

/**
 * A session's service: one it lists by name, which carries only what identifies it, or one sent with it. isInline tells
 * them apart.
 */
export type TAgentVaultSessionService =
  | (TAgentVaultSessionInlineService & { isInline: true })
  | {
      id: string;
      name: string;
      type: AgentVaultServiceType;
      description: string | null;
      /** The host an HTTP or MCP service matches. Null for database and SSH services. */
      hostPattern: string | null;
      isInline: false;
    };

/**
 * A session's skill: one it lists by name, which carries only what identifies it, or one sent with it, which also
 * carries the hash and size of its files.
 */
export type TAgentVaultSessionSkill =
  | { id: string; name: string; description: string; isInline: false }
  | {
      id: string;
      name: string;
      description: string;
      sha256: string;
      sizeBytes: number;
      fileCount: number;
      isInline: true;
    };

export type TAgentVaultSessionActor =
  | (Omit<Extract<TAgentVaultActor, { type: AgentVaultMemberType.User }>, "id"> & {
      id: string | null;
    })
  | (Omit<Extract<TAgentVaultActor, { type: AgentVaultMemberType.MachineIdentity }>, "id"> & {
      id: string | null;
    });

/** The user a machine identity started a session on behalf of. `id` is null once the user is deleted. */
export type TAgentVaultSessionOnBehalfOf = Extract<
  TAgentVaultSessionActor,
  { type: AgentVaultMemberType.User }
>;

export type TAgentVaultSession = {
  id: string;
  label: string | null;
  metadata: Record<string, string>;
  actor: TAgentVaultSessionActor;
  onBehalfOf: TAgentVaultSessionOnBehalfOf | null;
  status: AgentVaultSessionStatus;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  accessBundle: TAgentVaultSessionAccessBundle | null;
  /** Its services, listed by name or sent with it, in the order they were sent. Its access bundle's aren't listed. */
  services: TAgentVaultSessionService[];
  /** Its skills, listed by name or sent with it, in the order they were sent. Its access bundle's aren't listed. */
  skills: TAgentVaultSessionSkill[];
  /** Null until the proxy uploads the session's first log chunk. */
  stats: TAgentVaultSessionStats | null;
};

export type TAgentVaultSessionStats = {
  requests: number;
  /** Null when a proxy on a CLI older than 0.45.5 uploaded any of the session's logs. */
  brokered: number | null;
};

export type TAgentVaultDelegation = {
  machineIdentity: { id: string; name: string };
  scope: AgentVaultDelegationScope;
  users: (Omit<Extract<TAgentVaultActor, { type: AgentVaultMemberType.User }>, "type"> & {
    addedAt: string;
  })[];
  groups: (Omit<Extract<TAgentVaultActor, { type: AgentVaultMemberType.Group }>, "type"> & {
    addedAt: string;
  })[];
  createdAt: string;
  updatedAt: string;
};

export type TAgentVaultMissingAccessBundle = { id: string; name: string };

// Reading or writing one delegation also says which bundles its machine identity can't act on: the ones each user and
// group can use and the identity can't.
export type TAgentVaultDelegationDetail = Omit<TAgentVaultDelegation, "users" | "groups"> & {
  users: (TAgentVaultDelegation["users"][number] & {
    missingAccessBundles: TAgentVaultMissingAccessBundle[];
  })[];
  groups: (TAgentVaultDelegation["groups"][number] & {
    missingAccessBundles: TAgentVaultMissingAccessBundle[];
  })[];
  missingAccessBundles: TAgentVaultMissingAccessBundle[];
};

export type TChangeAgentVaultDelegationSubjectsDTO = {
  machineIdentityId: string;
  userIds?: string[];
  groupIds?: string[];
};

export type TSetAgentVaultDelegationDTO = {
  machineIdentityId: string;
  scope: AgentVaultDelegationScope;
  userIds?: string[];
  groupIds?: string[];
};

export type TAgentVaultMintedSession = {
  id: string;
  label: string | null;
  metadata: Record<string, string>;
  token: string;
  expiresAt: string | null;
  createdAt: string;
  projectId: string;
  accessBundle: TAgentVaultSessionAccessBundle | null;
  services: TAgentVaultSessionService[];
  skills: TAgentVaultSessionSkill[];
};

export type TAgentVaultProxy = {
  id: string;
  name: string;
  description: string | null;
  heartbeat: string | null;
  isHealthy: boolean;
  rootCaFingerprint: string | null;
  rootCaExpiresAt: string | null;
  trafficPolicy?: AgentVaultTrafficPolicy;
  allowedHosts?: string | null;
  pollInterval?: number;
  createdAt?: string;
};

export type TAgentVaultProxyCa = {
  certificate: string;
  fingerprint: string;
  expiresAt: string;
};

export type TAgentVaultProxyToken = {
  proxyToken: string;
};

export type TAgentVaultProxyWithToken = TAgentVaultProxyToken & {
  proxy: TAgentVaultProxy;
};

export type TListAgentVaultSessionsDTO = {
  scope?: AgentVaultSessionScope;
  statuses?: AgentVaultSessionStatus[];
  limit?: number;
  offset?: number;
  search?: string;
  metadata?: Record<string, string>;
};

export type TCreateAgentVaultAccessBundleDTO = {
  name: string;
  description?: string;
};

export type TUpdateAgentVaultAccessBundleDTO = {
  accessBundleId: string;
  name?: string;
  description?: string | null;
};

export type TCreateAgentVaultServiceDTO = {
  // Access bundles to add the new service to in the same request.
  accessBundleIds?: string[];
  hook?: TAgentVaultServiceHookInput;
} & (
  | {
      type: AgentVaultServiceType.Http;
      name: string;
      description?: string;
      hostPattern: string;
      allowedMethods?: AgentVaultHttpMethod[] | null;
      allowedPathPrefixes?: string[] | null;
      credential: TAgentVaultCredentialInput | TAgentVaultOauthCredentialInput;
      customHeaders?: TAgentVaultCustomHeaderInput[];
      substitutions?: TAgentVaultSubstitutionInput[];
    }
  | {
      type: AgentVaultServiceType.Mcp;
      name: string;
      description?: string;
      serverUrl: string;
      transport: AgentVaultMcpTransport;
      allowedTools?: string[] | null;
      credential:
        | Extract<TAgentVaultCredentialInput, { type: AgentVaultCredentialType.Bearer }>
        | TAgentVaultOauthCredentialInput;
      customHeaders?: TAgentVaultCustomHeaderInput[];
    }
  | {
      type: AgentVaultServiceType.Postgres | AgentVaultServiceType.Mysql;
      name: string;
      description?: string;
      host: string;
      port?: number;
      database: string;
      tls?: TAgentVaultNativeTlsInput;
      credential: TAgentVaultBasicCredentialInput;
    }
  | {
      type: AgentVaultServiceType.Ssh;
      name: string;
      description?: string;
      host: string;
      port?: number;
      credential: TAgentVaultBasicCredentialInput | TAgentVaultSshKeyCredentialInput;
    }
);

export type TUpdateAgentVaultServiceDTO = {
  serviceId: string;
  // Must match the service's type, which never changes.
  type: AgentVaultServiceType;
  name?: string;
  description?: string | null;
  hostPattern?: string;
  allowedMethods?: AgentVaultHttpMethod[] | null;
  allowedPathPrefixes?: string[] | null;
  serverUrl?: string;
  transport?: AgentVaultMcpTransport;
  allowedTools?: string[] | null;
  host?: string;
  port?: number;
  database?: string;
  tls?: TAgentVaultNativeTlsInput;
  credential?: TAgentVaultCredentialUpdate | TAgentVaultSshKeyCredentialUpdate;
  customHeaders?: TAgentVaultCustomHeaderInput[];
  substitutions?: TAgentVaultSubstitutionInput[];
  /** Left out keeps the service's hook; null removes it. */
  hook?: TAgentVaultServiceHookInput | null;
};

/** Credential and header values left out fall back to what the saved service stores, as on update. */
export type TListAgentVaultMcpToolsDTO = {
  projectId: string;
  serviceId?: string;
  serverUrl: string;
  transport: AgentVaultMcpTransport;
  credential?: TAgentVaultCredentialUpdate;
  customHeaders?: TAgentVaultCustomHeaderInput[];
};

export type TAgentVaultMcpTool = {
  name: string;
  description: string | null;
};

export type TAgentVaultOauthAuthorization = {
  id: string;
  status: AgentVaultOauthAuthorizationStatus;
  error: string | null;
  scopes: string[];
};

export type TCreateAgentVaultOauthAuthorizationDTO = {
  projectId: string;
  serverUrl: string;
  serviceId?: string;
  clientId?: string;
  clientSecret?: string;
  registration?: "dynamic";
  // A member's own sign-in for a service that leaves it to each member.
  personal?: boolean;
};

export type TCreateAgentVaultOauthAuthorizationResponse = {
  registrationRequired: boolean;
  // False when the server answered but advertises no OAuth, which usually means a wrong URL.
  oauthAdvertised: boolean;
  redirectUri: string;
  authorization: {
    id: string;
    authorizeUrl: string;
  } | null;
};

export type TCompleteAgentVaultOauthAuthorizationDTO = {
  authorizationId: string;
  state: string;
  code?: string;
  iss?: string;
  error?: string;
  errorDescription?: string;
};

export type TAddAgentVaultMembersDTO = TAgentVaultActorIdsDTO & {
  accessBundleId: string;
};

// Needs an access bundle, or at least one service or skill. Each is named rather than referenced by ID. The API also
// takes services and skills defined inline, which this UI doesn't send.
export type TCreateAgentVaultSessionDTO = {
  accessBundle?: string;
  services?: string[];
  skills?: string[];
  ttl: string;
  label?: string;
  metadata?: Record<string, string>;
};

export type TUpdateAgentVaultSessionDTO = {
  sessionId: string;
  label?: string | null;
  /** Replaces the session's whole metadata set; an empty object clears it. */
  metadata?: Record<string, string>;
};

export type TAgentVaultProxySettingsDTO = {
  name: string;
  trafficPolicy?: AgentVaultTrafficPolicy;
  allowedHosts?: string | null;
  pollInterval?: number;
};

export type TCreateAgentVaultProxyDTO = TAgentVaultProxySettingsDTO & {
  description?: string;
};

export type TUpdateAgentVaultProxyDTO = Partial<TAgentVaultProxySettingsDTO> & {
  proxyId: string;
  description?: string | null;
};

export type TAgentVaultSessionLogExternalStorage = {
  type: AgentVaultSessionLogStorageType.External;
  appConnectionId: string;
  bucket: string;
  region: string;
  keyPrefix: string | null;
};

export type TAgentVaultSessionLogStorage =
  | { type: AgentVaultSessionLogStorageType.Default }
  | TAgentVaultSessionLogExternalStorage;

export type TAgentVaultSessionLogSettings = {
  enabled: boolean;
  storage: TAgentVaultSessionLogStorage;
};

// settings is null when the instance has no default storage and no external bucket is saved.
export type TAgentVaultSessionLogSettingsState = {
  settings: TAgentVaultSessionLogSettings | null;
  defaultStorage: { configured: boolean };
};

export type TAgentVaultSessionLogHealth = {
  connectionError: string | null;
};

export type TAgentVaultSessionLogCorsProbe = {
  url: string;
  expiresInSeconds: number;
} | null;

export type TAgentVaultSessionLogReadAccess =
  | "readable"
  | "cors-missing"
  | "access-denied"
  | "host-blocked";

export type TAgentVaultSessionLogReadCheck = {
  status: TAgentVaultSessionLogReadAccess;
  host: string;
};

export type TAgentVaultSessionLogStorageInput =
  | { type: AgentVaultSessionLogStorageType.Default }
  | (Omit<TAgentVaultSessionLogExternalStorage, "keyPrefix"> & { keyPrefix?: string });

export type TUpdateAgentVaultSessionLogSettingsDTO =
  | { enabled: false }
  | { enabled: true; storage: TAgentVaultSessionLogStorageInput };

export type TAgentVaultSessionLogChunk = {
  chunkId: string;
  proxyId: string;
  ciphertextBytes: number;
  presignedGetUrl: string;
};

export type TAgentVaultSessionLogDisabledReason = "off" | "not-on-plan";

export type TAgentVaultSessionLog = {
  enabled: boolean;
  disabledReason: TAgentVaultSessionLogDisabledReason | null;
  storageType: AgentVaultSessionLogStorageType | null;
  isRecordable: boolean;
  sessionKey: string | null;
};

export type TAgentVaultSessionLogPage = {
  sessionLogs: TAgentVaultSessionLog;
  chunks: TAgentVaultSessionLogChunk[];
};

export type TAgentVaultSessionLogHistoryPage = TAgentVaultSessionLogPage & {
  nextCursor: string | null;
};

export type TAgentVaultSessionLogTailPage = TAgentVaultSessionLogPage & {
  nextCursor: string;
};

export type TAgentVaultSessionLogMcpCall = {
  method: string;
  tool?: string | null;
};

export type TAgentVaultSessionLogMcpDetail = {
  calls: TAgentVaultSessionLogMcpCall[];
  // False when the proxy could not read the body, as for one over its size limit.
  parsed: boolean;
  // True when the batch held more calls than the proxy keeps in one record.
  truncated?: boolean;
};

// What the proxy saw of a database or SSH exchange. Each text field is cut at the proxy's limit.
export type TAgentVaultSessionLogNativeDetail = {
  statement?: string;
  command?: string;
  stdin?: string;
  file?: string;
  result?: string;
  output?: string;
  // True for an interactive shell, which has no single command.
  shell?: boolean;
  note?: string;
  truncated?: boolean;
};

// The hook's part in a request the proxy refused or couldn't check. Written by the proxy; field names match the CLI's
// hookOutcome JSON tags.
export type TAgentVaultSessionLogHookOutcome = {
  decision: string;
  reason?: string;
  cause?: string;
  durationMs?: number;
  deliveryId?: string;
};

export type TAgentVaultSessionLogRecord = {
  ts: string;
  seq: number;
  proxyId: string;
  method: string;
  host: string;
  port: string;
  path: string;
  status: number;
  decision: AgentVaultSessionLogDecision;
  service: string | null;
  accessBundle: string | null;
  // Absent on records written before service types existed, and null when no service matched.
  serviceType?: AgentVaultServiceType | null;
  mcp?: TAgentVaultSessionLogMcpDetail;
  native?: TAgentVaultSessionLogNativeDetail;
  hook?: TAgentVaultSessionLogHookOutcome;
};

export type TAgentVaultSessionLogGapReason =
  | "fetch"
  | "missing"
  | "refused"
  | "size"
  | "gcm"
  | "json"
  | "mismatch";

export type TAgentVaultSessionLogGap = {
  reason: TAgentVaultSessionLogGapReason;
  // When this browser first saw the chunk on the live tail; null for chunks listed from the bucket.
  firstSeenAt: number | null;
};

export type TAgentVaultDecryptedChunk = {
  records: TAgentVaultSessionLogRecord[];
  gap: TAgentVaultSessionLogGap | null;
  arrivedAt: number | null;
};

export type TAgentVaultDecryptedSessionLogPage<
  P extends TAgentVaultSessionLogPage = TAgentVaultSessionLogPage
> = P & {
  decrypted: Record<string, TAgentVaultDecryptedChunk>;
};

export type TAgentVaultVariableUsedByService = {
  id: string;
  name: string;
  // Absent from servers that predate it, where a database or SSH service shows the generic icon.
  type?: AgentVaultServiceType;
  // null for a database or SSH service.
  hostPattern: string | null;
  // Every bundle the service is in. Empty for one no bundle holds, and a member sees only the ones they reach.
  accessBundles?: TAgentVaultBundleRef[];
};

export type TAgentVaultOauthVariableConnection = {
  issuer: string;
  grantedScopes: string[];
  requiredScopes: string[];
  expiresAt: string | null;
  authorizedAt: string | null;
  lastError: string | null;
};

// An OAuth variable's provider settings and sign-in. Its tokens and client secret never come back.
export type TAgentVaultOauthVariable = {
  status: AgentVaultOauthStatus;
  serverUrl: string | null;
  issuer: string | null;
  authorizationEndpoint: string | null;
  tokenEndpoint: string | null;
  clientId: string | null;
  registration: TAgentVaultOauthRegistration;
  tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod | null;
  scopes: string[];
  resource: string | null;
  clientName: string | null;
  // Set when an app hosts the sign-in callback, so a sign-in started here would return to that app.
  redirectUri: string | null;
  connection: TAgentVaultOauthVariableConnection | null;
};

export type TAgentVaultVariable = {
  id: string;
  key: string;
  scope: AgentVaultVariableScope;
  type: AgentVaultVariableType;
  oauth?: TAgentVaultOauthVariable | null;
  // Every service that references the variable, across all access bundles. For a personal variable, the services
  // whose personal values, as the caller set them, use it.
  usedByServices: TAgentVaultVariableUsedByService[];
  createdAt: string;
  updatedAt: string;
};

export type TAgentVaultOauthVariableSettingsInput = {
  serverUrl?: string;
  issuer?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  clientId?: string;
  tokenEndpointAuthMethod?: AgentVaultOauthClientAuthMethod;
  scopes?: string[];
  resource?: string;
  clientName?: string;
  redirectUri?: string;
};

// null clears a setting.
export type TAgentVaultOauthVariableSettingsUpdate = {
  [K in keyof TAgentVaultOauthVariableSettingsInput]?: K extends "scopes"
    ? string[]
    : TAgentVaultOauthVariableSettingsInput[K] | null;
};

export type TCreateAgentVaultVariableDTO =
  | {
      scope: AgentVaultVariableScope;
      type?: AgentVaultVariableType.Text;
      key: string;
      value: string;
    }
  | {
      scope: AgentVaultVariableScope.Global;
      type: AgentVaultVariableType.OAuth;
      key: string;
      oauth?: TAgentVaultOauthVariableSettingsInput;
    };

export type TUpdateAgentVaultVariableDTO = {
  variableId: string;
  key?: string;
  // null disconnects an OAuth variable.
  value?: string | null;
  oauth?: TAgentVaultOauthVariableSettingsUpdate;
};

// What starting a sign-in for an OAuth variable returns: the link, or what the variable needs before there can be one.
export type TAgentVaultOauthVariableSignInStart = {
  authorization: { id: string; authorizeUrl: string; expiresAt: string } | null;
  registrationRequired: boolean;
  manualSetupRequired: boolean;
  prefill: {
    authorizationEndpoint: string;
    tokenEndpoint: string;
    issuer: string | null;
    scopes: string[];
  } | null;
  redirectUri: string;
};

export type TStartAgentVaultOauthVariableSignInDTO = {
  variableId: string;
  clientSecret?: string;
};

// The caller's own values for one service, and which of them they have set. Values never come back.
export type TAgentVaultPersonalOauthConnection = {
  status: AgentVaultOauthStatus;
  issuer: string;
  grantedScopes: string[];
  requiredScopes: string[];
  expiresAt: string | null;
  authorizedAt: string | null;
  lastError: string | null;
};

export type TAgentVaultPersonalValues = {
  // False while the caller's connection needs reauthorization.
  isConfigured: boolean;
  fields: {
    field: TAgentVaultMemberProvidedField;
    isSet: boolean;
    updatedAt: string | null;
    variableReferences: { variableId: string; key: string }[];
    // The caller's own account connection, on the credential-value field of a service that leaves its OAuth
    // sign-in to each member. Null for a typed value.
    oauth: TAgentVaultPersonalOauthConnection | null;
  }[];
};

export type TSetAgentVaultPersonalValuesDTO = {
  serviceId: string;
  /** The type the dialog shows. If an admin changed it since, the save fails with a 409 instead of mislabeling a value. */
  credentialType: AgentVaultCredentialType;
  values: { field: TAgentVaultMemberProvidedField; value: string }[];
};

/** A completed sign-in, which connects the caller's account and replaces any connection they had. */
export type TConnectAgentVaultPersonalOauthDTO = {
  serviceId: string;
  credentialType: AgentVaultCredentialType;
  authorizationId: string;
};

export type TDeleteAgentVaultPersonalValuesDTO = { serviceId: string };

export type TAgentVaultSkillFileMode = "0644" | "0755";

export type TAgentVaultSkillFile = {
  path: string;
  mode: TAgentVaultSkillFileMode;
  contentBase64: string;
};

/** A skill as create and delete return it, without its access bundles. */
export type TAgentVaultSkillSummary = {
  id: string;
  name: string;
  description: string;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type TAgentVaultSkill = TAgentVaultSkillSummary & {
  /** Sorted by name. */
  accessBundles: { id: string; name: string }[];
};

export type TAgentVaultSkillDetail = TAgentVaultSkill & {
  /** The files of the latest version. */
  files: TAgentVaultSkillFile[];
};

export type TListAgentVaultServicesDTO = {
  search?: string;
  // Only services that need (true) or don't need (false) the caller's personal values.
  requiresSetup?: boolean;
  // Only services in bundles granted to the caller.
  granted?: boolean;
  orderBy?: "name" | "type" | "createdAt";
  orderDirection?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type TListAgentVaultSkillsDTO = {
  search?: string;
  /** Exact name. */
  name?: string;
  limit?: number;
  offset?: number;
};

export type TAgentVaultSkillPage = {
  skills: TAgentVaultSkill[];
  totalCount: number;
};

export type TAgentVaultSkillVersion = {
  id: string;
  version: number;
  sha256: string;
  sizeBytes: number;
  fileCount: number;
  createdAt: string;
};

export type TAgentVaultSkillVersionWithFiles = TAgentVaultSkillVersion & {
  files: TAgentVaultSkillFile[];
};

export type TAgentVaultBundleSkill = {
  id: string;
  name: string;
  description: string;
  latestVersion: number;
};

export type TCreateAgentVaultSkillDTO = {
  files: TAgentVaultSkillFile[];
};

export type TUpdateAgentVaultSkillDTO = TCreateAgentVaultSkillDTO & {
  skillId: string;
  /** The version the files were edited from. The server refuses the save when a newer one was published since. */
  baseVersion?: number;
};

export type TAgentVaultFreeUsage = {
  used: number;
  limit: number;
  resetsAt: string;
};

export type TAgentVaultAccess = {
  /** `free` and `limit-reached` are orgs without Agent Vault on their plan, counted against the free monthly requests. */
  state: "self-hosted" | "plan" | "open" | "free" | "limit-reached";
  /** False once the free requests are used: proxies refuse agent requests until a payment method is added or the month resets. */
  allowed: boolean;
  /** Only for an org on the free tier. Org-wide: sub-organizations share their root's count. */
  freeUsage: TAgentVaultFreeUsage | null;
  /** True from 80% of the free requests. */
  warn: boolean;
};

/** What a hook checks of its service: methods and paths of an HTTP service, tools of an MCP service. A list left out
 * matches everything. */
export type TAgentVaultHookNarrowing = {
  methods?: AgentVaultHttpMethod[];
  paths?: string[];
  tools?: string[];
};

/** A service's hook, with what it checks of that service. */
export type TAgentVaultServiceHook = TAgentVaultHookNarrowing & {
  id: string;
  name: string;
};

/** A service's hook as sent: a saved hook by name. */
export type TAgentVaultServiceHookInput = TAgentVaultHookNarrowing & {
  name: string;
};

/** A saved hook. Its secret is write-only and never returned. */
export type TAgentVaultHook = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  url: string;
  /** The saved services that use it. */
  usedBy: { id: string; name: string; type: AgentVaultServiceType; hostPattern: string | null }[];
  createdAt: string;
  updatedAt: string;
};

export type TListAgentVaultHooksDTO = {
  search?: string;
  limit?: number;
  offset?: number;
};

export type TAgentVaultHookPage = {
  hooks: TAgentVaultHook[];
  totalCount: number;
};

export type TCreateAgentVaultHookDTO = {
  name: string;
  description?: string;
  url: string;
  secret: string;
};

/** Fields left out keep their values; `secret` left out keeps the saved one and `description: null` removes it. */
export type TUpdateAgentVaultHookDTO = {
  hookId: string;
  name?: string;
  description?: string | null;
  url?: string;
  secret?: string;
};
