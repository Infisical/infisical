import { TGenericPermission } from "@app/lib/types";

import { TFindAgentVaultVariablesDTO } from "./agent-vault-variable-dal";

export type TAgentVaultVariableScoped = { projectId: string; ctx: TGenericPermission };

export type TListVariablesDTO = TAgentVaultVariableScoped &
  Omit<TFindAgentVaultVariablesDTO, "projectId" | "limit"> & { limit?: number };

export type TCreateVariableDTO = TAgentVaultVariableScoped & { key: string; value: string };

export type TUpdateVariableDTO = TAgentVaultVariableScoped & { variableId: string; key?: string; value?: string };

export type TVariableByIdDTO = TAgentVaultVariableScoped & { variableId: string };

export type TAgentVaultVariableUsedByService = {
  id: string;
  name: string;
  hostPattern: string;
  accessBundleId: string;
  accessBundleName: string;
};
