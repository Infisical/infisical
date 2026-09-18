import {
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

// A product membership carries two things a bundle grant has no use for: whether the person's
// organization invite is still open, and whether Agent Vault owns the machine identity, which decides
// whether the row offers Remove or Delete.
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

// Narrows the actor to one variant, so a tab that asked for users does not re-narrow in every cell.
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

// What a write answers with: the actor named but not hydrated, because these endpoints do not join the
// actor's row. Distinct from TAgentVaultProductMember, which only a read returns.
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
  status?: AgentVaultSessionStatus;
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
