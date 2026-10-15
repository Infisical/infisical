import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMcpTransport,
  AgentVaultMemberType,
  AgentVaultOAuthAuthorizationStatus,
  AgentVaultOAuthStatus,
  AgentVaultServiceType,
  AgentVaultSessionLogDecision,
  AgentVaultSessionScope,
  AgentVaultSessionStatus,
  AgentVaultSubstitutionSurface,
  AgentVaultTrafficPolicy,
  AgentVaultVariableReferenceField
} from "./enums";

export type TAgentVaultOAuthCredentialSummary = {
  type: AgentVaultCredentialType.OAuth;
  status: AgentVaultOAuthStatus;
  issuer: string;
  grantedScopes: string[];
  requiredScopes: string[];
  expiresAt: string | null;
  authorizedBy: { userId: string; username: string } | null;
  authorizedAt: string | null;
  lastError: string | null;
};

export type TAgentVaultCredentialSummary =
  | { type: AgentVaultCredentialType.Bearer; headerName: string; headerPrefix: string }
  | { type: AgentVaultCredentialType.Basic }
  | { type: AgentVaultCredentialType.Passthrough }
  | TAgentVaultOAuthCredentialSummary;

export type TAgentVaultCredentialInput =
  | {
      type: AgentVaultCredentialType.Bearer;
      headerName?: string;
      headerPrefix?: string;
      value: string;
    }
  | { type: AgentVaultCredentialType.Basic; username: string; password: string }
  | { type: AgentVaultCredentialType.Passthrough };

export type TAgentVaultOAuthCredentialInput = {
  type: AgentVaultCredentialType.OAuth;
  authorizationId: string;
};

export type TAgentVaultCredentialUpdate =
  | {
      type: AgentVaultCredentialType.Bearer;
      headerName?: string;
      headerPrefix?: string;
      value?: string;
    }
  | { type: AgentVaultCredentialType.Basic; username?: string; password?: string }
  | { type: AgentVaultCredentialType.Passthrough }
  | TAgentVaultOAuthCredentialInput;

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

export type TAgentVaultMcpServiceConfig = {
  serverUrl: string;
  transport: AgentVaultMcpTransport;
};

export type TAgentVaultServiceConfig =
  | { type: AgentVaultServiceType.Http; config: Record<string, never> }
  | { type: AgentVaultServiceType.Mcp; config: TAgentVaultMcpServiceConfig };

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
  actor: TAgentVaultSessionActor;
  status: AgentVaultSessionStatus;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  accessBundles: TAgentVaultSessionAccessBundle[];
};

export type TAgentVaultMintedSession = {
  id: string;
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

export type TAgentVaultEnrollment = {
  token: string;
  expiresAt: string;
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
      type?: AgentVaultServiceType.Http;
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
        | TAgentVaultOAuthCredentialInput;
      customHeaders?: TAgentVaultCustomHeaderInput[];
    };

export type TUpdateAgentVaultServiceDTO = {
  accessBundleId: string;
  serviceId: string;
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

export type TAgentVaultOAuthAuthorization = {
  id: string;
  status: AgentVaultOAuthAuthorizationStatus;
  error: string | null;
  scopes: string[];
};

export type TCreateAgentVaultOAuthAuthorizationDTO = {
  accessBundleId: string;
  serverUrl: string;
  serviceId?: string;
  clientId?: string;
  clientSecret?: string;
};

export type TCreateAgentVaultOAuthAuthorizationResponse = {
  registrationRequired: boolean;
  redirectUri: string;
  // Why the server's registration endpoint refused Infisical; null when it simply has none.
  registrationError: string | null;
  authorization: {
    id: string;
    status: AgentVaultOAuthAuthorizationStatus;
    authorizeUrl: string;
    scopes: string[];
  } | null;
};

export type TCompleteAgentVaultOAuthAuthorizationDTO = {
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
};

export type TAgentVaultProxySettingsDTO = {
  name: string;
  trafficPolicy?: AgentVaultTrafficPolicy;
  allowedHosts?: string | null;
  pollInterval?: number;
};

export type TAgentVaultSessionLogSettings = {
  enabled: boolean;
  appConnectionId: string | null;
  bucket: string | null;
  region: string | null;
  keyPrefix: string | null;
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

export type TUpdateAgentVaultSessionLogSettingsDTO = {
  enabled?: boolean;
  appConnectionId?: string | null;
  bucket?: string;
  region?: string;
  keyPrefix?: string;
};

export type TAgentVaultSessionLogChunk = {
  chunkId: string;
  proxyId: string;
  ciphertextBytes: number;
  presignedGetUrl: string;
};

export type TAgentVaultSessionLog = {
  enabled: boolean;
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

export type TAgentVaultVariable = {
  id: string;
  accessBundleId: string;
  key: string;
  serviceIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type TAgentVaultVariableRef = {
  accessBundleId: string;
  variableId: string;
};

export type TCreateAgentVaultVariableDTO = {
  accessBundleId: string;
  key: string;
  value: string;
};

export type TUpdateAgentVaultVariableDTO = TAgentVaultVariableRef & {
  key?: string;
  value?: string;
};
