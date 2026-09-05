import { TAgentVaultActorContext } from "../agent-vault/agent-vault-actor-types";
import { AgentVaultCredentialType } from "../agent-vault/agent-vault-enums";

export type TAgentVaultCredentialInput =
  | { type: AgentVaultCredentialType.Bearer; headerName?: string; headerPrefix?: string; value: string }
  | { type: AgentVaultCredentialType.Basic; username: string; password: string }
  | { type: AgentVaultCredentialType.Passthrough };

/** The same credential as a patch: an absent field keeps what is stored, an empty string clears it. */
export type TAgentVaultCredentialUpdate =
  | { type: AgentVaultCredentialType.Bearer; headerName?: string; headerPrefix?: string; value?: string }
  | { type: AgentVaultCredentialType.Basic; username?: string; password?: string }
  | { type: AgentVaultCredentialType.Passthrough };

/** The non-secret half, as every read path returns it. */
export type TAgentVaultCredentialSummary =
  | { type: AgentVaultCredentialType.Bearer; headerName: string; headerPrefix: string }
  | { type: AgentVaultCredentialType.Basic; username: string; hasPassword: boolean }
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

export type TAddMemberDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  userId?: string;
  identityId?: string;
  groupId?: string;
};

export type TRemoveMemberDTO = TAgentVaultProjectScoped & {
  accessBundleId: string;
  memberId: string;
};
