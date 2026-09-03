import {
  AgentVaultCredentialType,
  AgentVaultSessionScope,
  AgentVaultSessionStatus,
  AgentVaultSessionTtl,
  AgentVaultUnmatchedHost
} from "./enums";

export type TAgentVaultCredentialSummary =
  | { type: AgentVaultCredentialType.Bearer; headerName: string; headerPrefix: string }
  | { type: AgentVaultCredentialType.Basic; username: string; hasPassword: boolean }
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

/** A patch of the credential: an omitted field keeps what is stored, an empty string clears it. */
export type TAgentVaultCredentialUpdate =
  | {
      type: AgentVaultCredentialType.Bearer;
      headerName?: string;
      headerPrefix?: string;
      value?: string;
    }
  | { type: AgentVaultCredentialType.Basic; username?: string; password?: string }
  | { type: AgentVaultCredentialType.Passthrough };

export type TAgentVaultConnection = {
  id: string;
  accessBundleId: string;
  name: string;
  hostPattern: string;
  credential: TAgentVaultCredentialSummary;
  createdAt: string;
};

export type TAgentVaultMember = {
  id: string;
  userId: string | null;
  identityId: string | null;
  groupId: string | null;
  createdAt: string;
  user: {
    username: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
  identity: { name: string } | null;
  group: { name: string } | null;
};

export type TAgentVaultAccessBundle = {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
};

export type TAgentVaultAccessBundleListItem = TAgentVaultAccessBundle & {
  connectionCount: number;
  memberCount: number;
  hostPatterns: string[];
};

export type TAgentVaultAccessBundleDetails = TAgentVaultAccessBundle & {
  connections: TAgentVaultConnection[];
  // Absent for anyone but an Agent Vault administrator.
  members?: TAgentVaultMember[];
};

export type TAgentVaultConflictWarning = {
  connectionName: string;
  accessBundleName: string;
  patterns: string[];
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
  version: string | null;
  rootCaFingerprint: string | null;
  rootCaExpiresAt: string | null;
  // Administrator-only projection. A member receives the row without these.
  unmatchedHost?: AgentVaultUnmatchedHost;
  bypassHosts?: string | null;
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

export type TCreateAgentVaultConnectionDTO = {
  accessBundleId: string;
  name: string;
  hostPattern: string;
  credential: TAgentVaultCredentialInput;
};

export type TUpdateAgentVaultConnectionDTO = {
  accessBundleId: string;
  connectionId: string;
  name?: string;
  hostPattern?: string;
  credential?: TAgentVaultCredentialUpdate;
};

export type TAddAgentVaultMemberDTO = {
  accessBundleId: string;
  userId?: string;
  identityId?: string;
  groupId?: string;
};

export type TCreateAgentVaultSessionDTO = {
  accessBundleIds: string[];
  ttl: AgentVaultSessionTtl;
};

export type TAgentVaultProxySettingsDTO = {
  name: string;
  unmatchedHost?: AgentVaultUnmatchedHost;
  bypassHosts?: string | null;
  pollInterval?: number;
};
