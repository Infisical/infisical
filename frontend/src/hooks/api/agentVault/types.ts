import {
  AgentVaultCredentialType,
  AgentVaultSessionScope,
  AgentVaultSessionStatus,
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

export type TAgentVaultService = {
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
  serviceCount: number;
  memberCount: number;
  hostPatterns: string[];
};

export type TAgentVaultAccessBundleDetails = TAgentVaultAccessBundle & {
  services: TAgentVaultService[];
  members?: TAgentVaultMember[];
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
  credential: TAgentVaultCredentialInput;
};

export type TUpdateAgentVaultServiceDTO = {
  accessBundleId: string;
  serviceId: string;
  name?: string;
  hostPattern?: string;
  credential?: TAgentVaultCredentialUpdate;
};

export type TAddAgentVaultMembersDTO = {
  accessBundleId: string;
  userIds: string[];
  identityIds: string[];
  groupIds: string[];
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

export type TAgentVaultProductMember = {
  membershipId: string;
  userId: string | null;
  groupId: string | null;
  identityId: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
};

export type TAgentVaultProductUserMember = TAgentVaultProductMember & {
  email: string | null;
  username: string;
  firstName: string | null;
  lastName: string | null;
  isOrgMembershipPending: boolean;
};

export type TAgentVaultProductGroupMember = TAgentVaultProductMember & {
  name: string;
};

export type TAgentVaultProductIdentityMember = TAgentVaultProductMember & {
  name: string;
  identityProjectId: string | null;
  identityOrgId: string | null;
};

export type TAgentVaultProductMemberActor = {
  userId?: string;
  groupId?: string;
  identityId?: string;
};
