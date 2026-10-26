import { TGenericPermission } from "@app/lib/types";

import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMcpTransport,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  AgentVaultSubstitutionSurface,
  AgentVaultVariableReferenceField
} from "../agent-vault/agent-vault-enums";
import { TAgentVaultAccessBundleOrderBy } from "./agent-vault-access-bundle-dal";

export type TAgentVaultBearerMemberField = AgentVaultVariableReferenceField.CredentialValue;
export type TAgentVaultBasicMemberField =
  | AgentVaultVariableReferenceField.CredentialUsername
  | AgentVaultVariableReferenceField.CredentialValue;

// A member-provided field never carries a value here: each member sends their own.
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
  | { type: AgentVaultCredentialType.Passthrough }
  | { type: AgentVaultCredentialType.OAuth; authorizationId: string };

export type TAgentVaultCredentialUpdate = TAgentVaultCredentialInput;

export type TAgentVaultOauthCredentialSummary = {
  type: AgentVaultCredentialType.OAuth;
  status: AgentVaultOauthStatus;
  issuer: string;
  grantedScopes: string[];
  requiredScopes: string[];
  // Left out for members: they describe the admin's sign-in, not the service's setup.
  expiresAt?: string | null;
  authorizedAt?: string | null;
  lastError?: string | null;
};

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

export type TAgentVaultVariableReferenceSummary = { variableId: string; key: string } & (
  | { field: AgentVaultVariableReferenceField.CredentialValue | AgentVaultVariableReferenceField.CredentialUsername }
  | { field: AgentVaultVariableReferenceField.CustomHeader; customHeaderId: string }
  | { field: AgentVaultVariableReferenceField.Substitution; substitutionId: string }
);

export type TAgentVaultProjectScoped = { projectId: string; ctx: TGenericPermission };

export type TListAccessBundlesDTO = TAgentVaultProjectScoped & {
  requiresSetup?: boolean;
  granted?: boolean;
  search?: string;
  orderBy: TAgentVaultAccessBundleOrderBy;
  orderDirection: "asc" | "desc";
  limit: number;
  offset: number;
};

export type TGetAccessBundleDTO = TAgentVaultProjectScoped & { accessBundleId: string };

export type TCreateAccessBundleDTO = TAgentVaultProjectScoped & {
  name: string;
  description?: string;
};

export type TUpdateAccessBundleDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  name?: string;
  description?: string | null;
};

export type TDeleteAccessBundleDTO = TAgentVaultProjectScoped & { accessBundleId: string };

export type TAgentVaultCustomHeaderInput = { name: string; prefix?: string; value: string };

// `id` is optional because a row is matched by its name when the caller did not send one, and `value` is
// optional because omitting it keeps whatever is sealed for the row that matched.
export type TAgentVaultCustomHeaderUpdate = { id?: string; name: string; prefix?: string; value?: string };

export type TAgentVaultSubstitutionInput = {
  placeholder: string;
  surfaces: AgentVaultSubstitutionSurface[];
  value: string;
};

export type TAgentVaultSubstitutionUpdate = {
  id?: string;
  placeholder: string;
  surfaces: AgentVaultSubstitutionSurface[];
  value?: string;
};

// Flat rather than a union on `type`: which of the type-specific fields a service takes is decided by the
// service type registry, which refuses the ones its type does not take.
export type TCreateServiceDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  type: AgentVaultServiceType;
  name: string;
  hostPattern?: string;
  serverUrl?: string;
  transport?: AgentVaultMcpTransport;
  allowedMethods?: AgentVaultHttpMethod[] | null;
  allowedPathPrefixes?: string[] | null;
  credential: TAgentVaultCredentialInput;
  customHeaders?: TAgentVaultCustomHeaderInput[];
  substitutions?: TAgentVaultSubstitutionInput[];
};

export type TUpdateServiceDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  serviceId: string;
  // Must match the stored type, which never changes.
  type: AgentVaultServiceType;
  name?: string;
  hostPattern?: string;
  // Null only as an HTTP service's read-back value.
  serverUrl?: string | null;
  transport?: AgentVaultMcpTransport | null;
  allowedMethods?: AgentVaultHttpMethod[] | null;
  allowedPathPrefixes?: string[] | null;
  credential?: TAgentVaultCredentialUpdate;
  customHeaders?: TAgentVaultCustomHeaderUpdate[];
  substitutions?: TAgentVaultSubstitutionUpdate[];
};

export type TDeleteServiceDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  serviceId: string;
};

export type TListMembersDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  search?: string;
  limit: number;
  offset: number;
};

export type TAddMembersDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  userIds: string[];
  groupIds: string[];
  machineIdentityIds: string[];
};

export type TRevokeMembersDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  userIds: string[];
  groupIds: string[];
  machineIdentityIds: string[];
};
