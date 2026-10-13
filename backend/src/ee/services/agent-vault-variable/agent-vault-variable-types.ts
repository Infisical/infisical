import { TAgentVaultProjectScoped } from "../agent-vault-access-bundle/agent-vault-access-bundle-types";

export type TCreateVariableDTO = TAgentVaultProjectScoped & { key: string; value: string };

export type TUpdateVariableDTO = TAgentVaultProjectScoped & { variableId: string; key?: string; value?: string };

export type TVariableByIdDTO = TAgentVaultProjectScoped & { variableId: string };

export type TAgentVaultVariableUsedBy = {
  id: string;
  name: string;
  hostPattern: string;
  accessBundleId: string;
  accessBundleName: string;
};
