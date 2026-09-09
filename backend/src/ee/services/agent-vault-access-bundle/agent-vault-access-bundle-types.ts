import { TAgentVaultActorContext } from "../agent-vault/agent-vault-actor-types";
import { AgentVaultCredentialType } from "../agent-vault/agent-vault-enums";

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

export type TCreateConnectionDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  name: string;
  hostPattern: string;
  credential: TAgentVaultCredentialInput;
};

export type TUpdateConnectionDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  connectionId: string;
  name?: string;
  hostPattern?: string;
  credential?: TAgentVaultCredentialUpdate;
};

export type TDeleteConnectionDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  connectionId: string;
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
