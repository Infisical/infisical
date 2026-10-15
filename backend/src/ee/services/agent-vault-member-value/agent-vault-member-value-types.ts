import { TAgentVaultMemberProvidedField } from "../agent-vault/agent-vault-enums";
import { TAgentVaultProjectScoped } from "../agent-vault-access-bundle/agent-vault-access-bundle-types";

export type TMemberValuesByServiceDTO = TAgentVaultProjectScoped & { accessBundleId: string; serviceId: string };

export type TSetMemberValuesDTO = TMemberValuesByServiceDTO & {
  values: { field: TAgentVaultMemberProvidedField; value: string }[];
};
