import { TAgentVaultMemberProvidedField } from "../agent-vault/agent-vault-enums";
import { TAgentVaultProjectScoped } from "../agent-vault-access-bundle/agent-vault-access-bundle-types";

export type TPersonalValuesByServiceDTO = TAgentVaultProjectScoped & { accessBundleId: string; serviceId: string };

export type TSetPersonalValuesDTO = TPersonalValuesByServiceDTO & {
  values: { field: TAgentVaultMemberProvidedField; value: string }[];
};
