import { TAgentVaultActorContext } from "../agent-vault/agent-vault-actor-types";
import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultSubstitutionSurface
} from "../agent-vault/agent-vault-enums";
import { TAgentVaultAccessBundleOrderBy } from "./agent-vault-access-bundle-dal";

export type TAgentVaultCredentialInput =
  | { type: AgentVaultCredentialType.Bearer; headerName?: string; headerPrefix?: string; value: string }
  | { type: AgentVaultCredentialType.Basic; username: string; password: string }
  | { type: AgentVaultCredentialType.Passthrough };

export type TAgentVaultCredentialUpdate =
  | { type: AgentVaultCredentialType.Bearer; headerName?: string; headerPrefix?: string; value?: string }
  | { type: AgentVaultCredentialType.Basic; username?: string; password?: string }
  | { type: AgentVaultCredentialType.Passthrough };

export type TAgentVaultCredentialSummary =
  | { type: AgentVaultCredentialType.Bearer; headerName: string; headerPrefix: string }
  | { type: AgentVaultCredentialType.Basic }
  | { type: AgentVaultCredentialType.Passthrough };

export type TAgentVaultProjectScoped = { projectId: string; ctx: TAgentVaultActorContext };

export type TListAccessBundlesDTO = TAgentVaultProjectScoped & {
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

export type TCreateServiceDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  name: string;
  hostPattern: string;
  allowedMethods?: AgentVaultHttpMethod[] | null;
  allowedPathPrefixes?: string[] | null;
  credential: TAgentVaultCredentialInput;
  customHeaders?: TAgentVaultCustomHeaderInput[];
  substitutions?: TAgentVaultSubstitutionInput[];
};

export type TUpdateServiceDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  serviceId: string;
  name?: string;
  hostPattern?: string;
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
