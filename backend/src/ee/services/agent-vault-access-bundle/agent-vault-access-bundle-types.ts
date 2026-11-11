import { TGenericPermission } from "@app/lib/types";

import { AgentVaultOauthRegistration } from "../agent-vault-oauth/agent-vault-oauth-types";
import { TOnBehalfOfUser } from "../agent-vault-session/agent-vault-session-types";
import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMcpTransport,
  AgentVaultMemberType,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  AgentVaultSubstitutionSurface,
  AgentVaultVariableReferenceField,
  TAgentVaultMemberProvidedField
} from "../agent-vault/agent-vault-enums";
import { TAgentVaultServiceTypeFields } from "../agent-vault/agent-vault-service-type-fns";
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
  | {
      type: AgentVaultCredentialType.OAuth;
      // The admin's own sign-in. Absent when the sign-in is left to each member.
      authorizationId?: string;
      memberProvidedFields?: TAgentVaultBearerMemberField[];
      // The client every member signs in with, only when the sign-in is left to them.
      clientId?: string;
      clientSecret?: string;
      registration?: AgentVaultOauthRegistration.Dynamic;
    }
  | {
      type: AgentVaultCredentialType.SshKey;
      username?: string;
      privateKey?: string;
      // null removes a stored certificate.
      certificate?: string | null;
      // Accepted only so a request that sends any is refused by name: a key can't be left to members yet.
      memberProvidedFields?: TAgentVaultMemberProvidedField[];
    };

export type TAgentVaultCredentialUpdate = TAgentVaultCredentialInput;

export type TAgentVaultOauthCredentialSummary = {
  type: AgentVaultCredentialType.OAuth;
  memberProvidedFields: TAgentVaultBearerMemberField[];
  // Absent when each member signs in: there is no shared connection to describe, and each member reads their own.
  status?: AgentVaultOauthStatus;
  issuer: string;
  // Only when each member signs in.
  registration?: AgentVaultOauthRegistration;
  clientId?: string | null;
  grantedScopes: string[];
  requiredScopes: string[];
  // Left out for members: they describe the admin's sign-in, not the service's setup.
  expiresAt?: string | null;
  authorizedAt?: string | null;
  lastError?: string | null;
};

export type TAgentVaultBearerCredentialSummary = {
  type: AgentVaultCredentialType.Bearer;
  headerName: string;
  headerPrefix: string;
  memberProvidedFields: TAgentVaultBearerMemberField[];
};

export type TAgentVaultBasicCredentialSummary = {
  type: AgentVaultCredentialType.Basic;
  memberProvidedFields: TAgentVaultBasicMemberField[];
};

export type TAgentVaultSshKeyCredentialSummary = { type: AgentVaultCredentialType.SshKey; hasCertificate: boolean };

export type TAgentVaultCredentialSummary =
  | TAgentVaultBearerCredentialSummary
  | TAgentVaultBasicCredentialSummary
  | { type: AgentVaultCredentialType.Passthrough }
  | TAgentVaultSshKeyCredentialSummary
  | TAgentVaultOauthCredentialSummary;

export type TAgentVaultVariableReferenceSummary = { variableId: string; key: string } & (
  | { field: AgentVaultVariableReferenceField.CredentialValue | AgentVaultVariableReferenceField.CredentialUsername }
  | { field: AgentVaultVariableReferenceField.CustomHeader; customHeaderId: string }
  | { field: AgentVaultVariableReferenceField.Substitution; substitutionId: string }
);

export type TAgentVaultCredentialReferenceSummary = Extract<
  TAgentVaultVariableReferenceSummary,
  { field: AgentVaultVariableReferenceField.CredentialValue | AgentVaultVariableReferenceField.CredentialUsername }
>;

type TAgentVaultCustomHeaderSummary = { id: string; name: string; prefix: string };

// Each type carries only the credentials it accepts and the transformations it applies, and so only the variable
// references those can hold.
export type TAgentVaultServiceSummary = {
  id: string;
  accessBundleId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
} & (
  | (Extract<TAgentVaultServiceTypeFields, { type: AgentVaultServiceType.Http }> & {
      credential: Extract<
        TAgentVaultCredentialSummary,
        {
          type: AgentVaultCredentialType.Bearer | AgentVaultCredentialType.Basic | AgentVaultCredentialType.Passthrough;
        }
      >;
      customHeaders: TAgentVaultCustomHeaderSummary[];
      substitutions: { id: string; placeholder: string; surfaces: AgentVaultSubstitutionSurface[] }[];
      variableReferences: TAgentVaultVariableReferenceSummary[];
    })
  | (Extract<TAgentVaultServiceTypeFields, { type: AgentVaultServiceType.Mcp }> & {
      allowedTools: string[] | null;
      credential: TAgentVaultBearerCredentialSummary | TAgentVaultOauthCredentialSummary;
      customHeaders: TAgentVaultCustomHeaderSummary[];
      variableReferences: Exclude<
        TAgentVaultVariableReferenceSummary,
        { field: AgentVaultVariableReferenceField.Substitution }
      >[];
    })
  | (Extract<TAgentVaultServiceTypeFields, { type: AgentVaultServiceType.Postgres | AgentVaultServiceType.Mysql }> & {
      credential: TAgentVaultBasicCredentialSummary;
      variableReferences: TAgentVaultCredentialReferenceSummary[];
    })
  | (Extract<TAgentVaultServiceTypeFields, { type: AgentVaultServiceType.Ssh }> & {
      credential: TAgentVaultBasicCredentialSummary | TAgentVaultSshKeyCredentialSummary;
      variableReferences: TAgentVaultCredentialReferenceSummary[];
    })
);

export type TAgentVaultProjectScoped = { projectId: string; ctx: TGenericPermission };

export type TListAccessBundlesDTO = TAgentVaultProjectScoped & {
  requiresSetup?: boolean;
  granted?: boolean;
  onBehalfOf?: TOnBehalfOfUser;
  search?: string;
  orderBy: TAgentVaultAccessBundleOrderBy;
  orderDirection: "asc" | "desc";
  limit: number;
  offset: number;
};

export type TGetAccessBundleDTO = TAgentVaultProjectScoped & { accessBundleId: string };

export type TCreateAccessBundleDTO = TAgentVaultProjectScoped & {
  name: string;
  description?: string | null;
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
// `ca: null` (or "") removes a stored certificate authority.
export type TAgentVaultNativeTlsInput = { enabled?: boolean; verify?: boolean; ca?: string | null };

export type TCreateServiceDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  type: AgentVaultServiceType;
  name: string;
  description?: string | null;
  hostPattern?: string;
  serverUrl?: string;
  transport?: AgentVaultMcpTransport;
  host?: string;
  port?: number;
  database?: string;
  tls?: TAgentVaultNativeTlsInput;
  allowedMethods?: AgentVaultHttpMethod[] | null;
  allowedPathPrefixes?: string[] | null;
  allowedTools?: string[] | null;
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
  description?: string | null;
  // Null only as a database or SSH service's read-back value.
  hostPattern?: string | null;
  // Null only as an HTTP service's read-back value.
  serverUrl?: string | null;
  transport?: AgentVaultMcpTransport | null;
  // Null only as the read-back value of a type that doesn't take them.
  host?: string | null;
  port?: number | null;
  database?: string | null;
  tls?: TAgentVaultNativeTlsInput | null;
  allowedMethods?: AgentVaultHttpMethod[] | null;
  allowedPathPrefixes?: string[] | null;
  allowedTools?: string[] | null;
  credential?: TAgentVaultCredentialUpdate;
  customHeaders?: TAgentVaultCustomHeaderUpdate[];
  substitutions?: TAgentVaultSubstitutionUpdate[];
};

// What the service sheet would save, so the tools are listed with the credential agents will use. On edit, a value
// left out falls back to what the saved service stores, as on update.
export type TListMcpToolsDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  serviceId?: string;
  serverUrl: string;
  transport: AgentVaultMcpTransport;
  credential?: TAgentVaultCredentialUpdate;
  customHeaders?: TAgentVaultCustomHeaderUpdate[];
};

export type TDeleteServiceDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  serviceId: string;
};

export type TListMembersDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  actorType?: AgentVaultMemberType;
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
