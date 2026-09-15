import { TAgentVaultActorContext } from "../agent-vault/agent-vault-actor-types";
import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultSubstitutionSurface
} from "../agent-vault/agent-vault-enums";

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

export type TListAccessBundlesDTO = TAgentVaultProjectScoped;

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
  // null and undefined both mean unrestricted on create; the column stores null.
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
  // undefined leaves the restriction alone, null clears it.
  allowedMethods?: AgentVaultHttpMethod[] | null;
  allowedPathPrefixes?: string[] | null;
  credential?: TAgentVaultCredentialUpdate;
  // undefined leaves the list alone; an array replaces it wholesale.
  customHeaders?: TAgentVaultCustomHeaderUpdate[];
  substitutions?: TAgentVaultSubstitutionUpdate[];
};

export type TDeleteServiceDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  serviceId: string;
};

export type TListMembersDTO = TAgentVaultProjectScoped & { accessBundleId: string };

export type TAddMembersDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  userIds: string[];
  groupIds: string[];
  identityIds: string[];
};

export type TRemoveMemberDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  memberId: string;
};
