import {
  AgentVaultActivityDecision,
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMemberType,
  AgentVaultSessionScope,
  AgentVaultSessionStatus,
  AgentVaultSubstitutionSurface,
  AgentVaultTrafficPolicy
} from "./enums";

export type TAgentVaultCredentialSummary =
  | { type: AgentVaultCredentialType.Bearer; headerName: string; headerPrefix: string }
  | { type: AgentVaultCredentialType.Basic }
  | { type: AgentVaultCredentialType.Passthrough };

export type TAgentVaultCredentialInput =
  | {
      type: AgentVaultCredentialType.Bearer;
      headerName?: string;
      headerPrefix?: string;
      value: string;
    }
  | { type: AgentVaultCredentialType.Basic; username: string; password: string }
  | { type: AgentVaultCredentialType.Passthrough };

export type TAgentVaultCredentialUpdate =
  | {
      type: AgentVaultCredentialType.Bearer;
      headerName?: string;
      headerPrefix?: string;
      value?: string;
    }
  | { type: AgentVaultCredentialType.Basic; username?: string; password?: string }
  | { type: AgentVaultCredentialType.Passthrough };

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

export type TAgentVaultService = {
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

export type TAgentVaultMember = {
  id: string;
  createdAt: string;
  actor: TAgentVaultActor;
};

export type TAgentVaultProductActor =
  | (Extract<TAgentVaultActor, { type: AgentVaultMemberType.User }> & {
      isOrgMembershipPending: boolean;
    })
  | (Extract<TAgentVaultActor, { type: AgentVaultMemberType.MachineIdentity }> & {
      isManagedByAgentVault: boolean;
      orgId: string | null;
    })
  | Extract<TAgentVaultActor, { type: AgentVaultMemberType.Group }>;

export type TAgentVaultProductMember = {
  id: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  actor: TAgentVaultProductActor;
};

export type TAgentVaultProductMemberOf<T extends AgentVaultMemberType> = Omit<
  TAgentVaultProductMember,
  "actor"
> & {
  actor: Extract<TAgentVaultProductActor, { type: T }>;
};

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

export type TAgentVaultWrittenMember = {
  id: string;
  role: string;
  createdAt: string;
  actor: TAgentVaultActorRef;
};

export type TAgentVaultMemberWriteResult<T> = {
  members: T[];
  skipped: (TAgentVaultActorRef & { identifier: string })[];
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
  description: string | null;
  position: number;
};

export type TAgentVaultSession = {
  id: string;
  userId: string | null;
  identityId: string | null;
  actorName: string;
  actorEmail: string | null;
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

export type TCreateAgentVaultServiceDTO = {
  accessBundleId: string;
  name: string;
  hostPattern: string;
  allowedMethods?: AgentVaultHttpMethod[] | null;
  allowedPathPrefixes?: string[] | null;
  credential: TAgentVaultCredentialInput;
  customHeaders?: TAgentVaultCustomHeaderInput[];
  substitutions?: TAgentVaultSubstitutionInput[];
};

export type TUpdateAgentVaultServiceDTO = {
  accessBundleId: string;
  serviceId: string;
  name?: string;
  hostPattern?: string;
  allowedMethods?: AgentVaultHttpMethod[] | null;
  allowedPathPrefixes?: string[] | null;
  credential?: TAgentVaultCredentialUpdate;
  customHeaders?: TAgentVaultCustomHeaderInput[];
  substitutions?: TAgentVaultSubstitutionInput[];
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

export type TAgentVaultActivityConfig = {
  enabled: boolean;
  appConnectionId: string | null;
  bucket: string | null;
  region: string | null;
  keyPrefix: string | null;
  configVersion: number;
};

export type TAgentVaultActivityConfigResponse = {
  config: TAgentVaultActivityConfig;
  isStorageFull: boolean;
  corsProbeUrl: string | null;
  connectionError: string | null;
};

export const isAgentVaultRecording = (config: TAgentVaultActivityConfig) =>
  Boolean(config.enabled && config.appConnectionId && config.bucket && config.region);

export type TUpdateAgentVaultActivityConfigDTO = {
  enabled?: boolean;
  appConnectionId?: string | null;
  bucket?: string;
  region?: string;
  keyPrefix?: string;
};

export type TAgentVaultActivityChunk = {
  chunkId: string;
  proxyId: string;
  proxyName: string | null;
  startedAt: string;
  endedAt: string;
  firstSeq: number;
  lastSeq: number;
  recordCount: number;
  droppedCount: number;
  configVersion: number;
  ciphertextBytes: number;
  iv: string;
  presignedGetUrl: string | null;
};

export type TAgentVaultActivityPage = {
  enabled: boolean;
  sessionKey: string | null;
  projectId: string;
  configVersion: number;
  chunks: TAgentVaultActivityChunk[];
  nextCursor: string | null;
  hasMore: boolean;
  nextReceivedAfter: string;
  storageUnavailable: {
    reason: "no-connection" | "connection-unusable";
    message: string | null;
  } | null;
};

export type TAgentVaultActivityRecord = {
  ts: string;
  seq: number;
  proxyId: string;
  method: string;
  host: string;
  port: string;
  path: string;
  status: number;
  decision: AgentVaultActivityDecision;
  service: string | null;
  accessBundle: string | null;
};

export type TAgentVaultActivityGapReason =
  | "fetch"
  | "missing"
  | "refused"
  | "size"
  | "gcm"
  | "json"
  | "mismatch"
  | "repointed";

export type TAgentVaultActivityGap = {
  chunkId: string;
  proxyId: string;
  proxyName: string | null;
  startedAt: string;
  reason: TAgentVaultActivityGapReason;
  recordCount: number;
};

export type TAgentVaultActivityDrop = {
  chunkId: string;
  proxyId: string;
  proxyName: string | null;
  startedAt: string;
  droppedCount: number;
};

export type TAgentVaultDecryptedChunk = {
  records: TAgentVaultActivityRecord[];
  gap: TAgentVaultActivityGap | null;
  drop: TAgentVaultActivityDrop | null;
  arrivedAt: number | null;
};

export type TAgentVaultDecryptedActivityPage = TAgentVaultActivityPage & {
  decrypted: Record<string, TAgentVaultDecryptedChunk>;
};
