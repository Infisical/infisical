import { TAgentVaultProjectScoped } from "../agent-vault-access-bundle/agent-vault-access-bundle-types";
import { AgentVaultCredentialType, TAgentVaultMemberProvidedField } from "../agent-vault/agent-vault-enums";

export type TPersonalValuesByServiceDTO = TAgentVaultProjectScoped & { accessBundleId: string; serviceId: string };

export type TSetPersonalValuesDTO = TPersonalValuesByServiceDTO & {
  values: { field: TAgentVaultMemberProvidedField; value: string }[];
  // The type the caller's copy of the service shows, so a save made against a stale copy fails instead of storing
  // a password as a token.
  credentialType?: AgentVaultCredentialType;
};

// For a service that leaves its OAuth sign-in to members: the member's completed authorization.
export type TConnectPersonalOauthDTO = TPersonalValuesByServiceDTO & {
  authorizationId: string;
  credentialType?: AgentVaultCredentialType;
};
