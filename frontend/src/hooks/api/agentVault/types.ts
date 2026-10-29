import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMcpTransport,
  AgentVaultMemberType,
  AgentVaultOauthAuthorizationStatus,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  AgentVaultSessionLogDecision,
  AgentVaultSessionLogStorageType,
  AgentVaultSessionScope,
  AgentVaultSessionStatus,
  AgentVaultSubstitutionSurface,
  AgentVaultTrafficPolicy,
  AgentVaultVariableReferenceField,
  AgentVaultVariableScope
} from "./enums";

/** A field an admin can leave to each member: a bearer token or basic password, or a basic username. */
export type TAgentVaultMemberProvidedField =
  | AgentVaultVariableReferenceField.CredentialValue
  | AgentVaultVariableReferenceField.CredentialUsername;

export type TAgentVaultOauthCredentialSummary = {
  type: AgentVaultCredentialType.OAuth;
  status: AgentVaultOauthStatus;
  issuer: string;
  grantedScopes: string[];
  requiredScopes: string[];
  // Left out for Agent Vault members.
  expiresAt?: string | null;
  authorizedAt?: string | null;
  lastError?: string | null;
};

export type TAgentVaultBearerMemberField = AgentVaultVariableReferenceField.CredentialValue;
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
  | TAgentVaultOauthCredentialSummary;

export type TAgentVaultOauthCredentialInput = {
  type: AgentVaultCredentialType.OAuth;
  authorizationId: string;
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

export type TAgentVaultServiceConfig =
  | { type: AgentVaultServiceType.Http; serverUrl: null; transport: null }
  | { type: AgentVaultServiceType.Mcp; serverUrl: string; transport: AgentVaultMcpTransport };

export type TAgentVaultService = TAgentVaultServiceConfig & {
  id: string;
  accessBundleId: string;
  name: string;
  hostPattern: string;
  // null means unrestricted.
  allowedMethods: AgentVaultHttpMethod[] | null;
  allowedPathPrefixes: string[] | null;
  credential: TAgentVaultCredentialSummary;
  customHeaders: TAgentVaultCustomHeaderSummary[];
  substitutions: TAgentVaultSubstitutionSummary[];
  // Left out for a member, who can't see variables.
  variableReferences?: TAgentVaultVariableReference[];
  // The caller's own values, on the bundle read only. null when the admin sets the whole credential.
  personalValues?: TAgentVaultPersonalValues | null;
  createdAt: string;
  updatedAt: string;
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

export type TAgentVaultMember = TAgentVaultActor & { grantedAt: string };

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
  servicesRequiringSetup: { id: string; name: string }[];
};

export type TAgentVaultAccessBundleDetails = TAgentVaultAccessBundle & {
  services: TAgentVaultService[];
};

export type TAgentVaultSessionAccessBundle = {
  id: string | null;
  name: string;
  position: number;
};

export type TAgentVaultSessionActor =
  | (Omit<Extract<TAgentVaultActor, { type: AgentVaultMemberType.User }>, "id"> & {
      id: string | null;
    })
  | (Omit<Extract<TAgentVaultActor, { type: AgentVaultMemberType.MachineIdentity }>, "id"> & {
      id: string | null;
    });

export type TAgentVaultSession = {
  id: string;
  label: string | null;
  actor: TAgentVaultSessionActor;
  status: AgentVaultSessionStatus;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  accessBundles: TAgentVaultSessionAccessBundle[];
};

export type TAgentVaultMintedSession = {
  id: string;
  label: string | null;
  token: string;
  expiresAt: string | null;
  createdAt: string;
  accessBundles: TAgentVaultSessionAccessBundle[];
};

export type TAgentVaultProxy = {
  id: string;
  name: string;
  heartbeat: string | null;
  isHealthy: boolean;
  rootCaFingerprint: string | null;
  rootCaExpiresAt: string | null;
  trafficPolicy?: AgentVaultTrafficPolicy;
  allowedHosts?: string | null;
  pollInterval?: number;
  createdAt?: string;
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

export type TCreateAgentVaultServiceDTO =
  | {
      accessBundleId: string;
      type: AgentVaultServiceType.Http;
      name: string;
      hostPattern: string;
      allowedMethods?: AgentVaultHttpMethod[] | null;
      allowedPathPrefixes?: string[] | null;
      credential: TAgentVaultCredentialInput;
      customHeaders?: TAgentVaultCustomHeaderInput[];
      substitutions?: TAgentVaultSubstitutionInput[];
    }
  | {
      accessBundleId: string;
      type: AgentVaultServiceType.Mcp;
      name: string;
      serverUrl: string;
      transport: AgentVaultMcpTransport;
      credential:
        | Extract<TAgentVaultCredentialInput, { type: AgentVaultCredentialType.Bearer }>
        | TAgentVaultOauthCredentialInput;
      customHeaders?: TAgentVaultCustomHeaderInput[];
    };

export type TUpdateAgentVaultServiceDTO = {
  accessBundleId: string;
  serviceId: string;
  // Must match the service's type, which never changes.
  type: AgentVaultServiceType;
  name?: string;
  hostPattern?: string;
  allowedMethods?: AgentVaultHttpMethod[] | null;
  allowedPathPrefixes?: string[] | null;
  serverUrl?: string;
  transport?: AgentVaultMcpTransport;
  credential?: TAgentVaultCredentialUpdate;
  customHeaders?: TAgentVaultCustomHeaderInput[];
  substitutions?: TAgentVaultSubstitutionInput[];
};

export type TAgentVaultOauthAuthorization = {
  id: string;
  status: AgentVaultOauthAuthorizationStatus;
  error: string | null;
  scopes: string[];
};

export type TCreateAgentVaultOauthAuthorizationDTO = {
  accessBundleId: string;
  serverUrl: string;
  serviceId?: string;
  clientId?: string;
  clientSecret?: string;
  registration?: "dynamic";
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

export type TCreateAgentVaultSessionDTO = {
  accessBundles: string[];
  ttl: string;
  label?: string;
};

export type TUpdateAgentVaultSessionLabelDTO = {
  sessionId: string;
  label: string | null;
};

export type TAgentVaultProxySettingsDTO = {
  name: string;
  trafficPolicy?: AgentVaultTrafficPolicy;
  allowedHosts?: string | null;
  pollInterval?: number;
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
  hostPattern: string;
  accessBundleId: string;
  accessBundleName: string;
};

export type TAgentVaultVariable = {
  id: string;
  key: string;
  scope: AgentVaultVariableScope;
  // Every service that references the variable, across all access bundles. For a personal variable, the services
  // whose personal values, as the caller set them, use it.
  usedByServices: TAgentVaultVariableUsedByService[];
  createdAt: string;
  updatedAt: string;
};

export type TCreateAgentVaultVariableDTO = {
  scope: AgentVaultVariableScope;
  key: string;
  value: string;
};

export type TUpdateAgentVaultVariableDTO = {
  variableId: string;
  key?: string;
  value?: string;
};

// The caller's own values for one service, and which of them they have set. Values never come back.
export type TAgentVaultPersonalValues = {
  isConfigured: boolean;
  fields: {
    field: TAgentVaultMemberProvidedField;
    isSet: boolean;
    updatedAt: string | null;
    variableReferences: { variableId: string; key: string }[];
  }[];
};

export type TSetAgentVaultPersonalValuesDTO = {
  accessBundleId: string;
  serviceId: string;
  values: { field: TAgentVaultMemberProvidedField; value: string }[];
  /** The type the dialog shows. If an admin changed it since, the save fails with a 409 instead of mislabeling a value. */
  credentialType: AgentVaultCredentialType;
};

export type TDeleteAgentVaultPersonalValuesDTO = { accessBundleId: string; serviceId: string };

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
