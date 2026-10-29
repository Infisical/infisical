import { TGenericPermission } from "@app/lib/types";

import { AgentVaultVariableScope } from "../agent-vault/agent-vault-enums";
import { TFindAgentVaultVariablesDTO } from "./agent-vault-variable-dal";

export type TAgentVaultVariableScoped = { projectId: string; ctx: TGenericPermission };

export type TListVariablesDTO = TAgentVaultVariableScoped &
  Omit<TFindAgentVaultVariablesDTO, "projectId" | "owners" | "limit" | "accessBundleIds"> & {
    limit?: number;
    // Omitted lists everything the caller can see: their own, and the global ones too for an admin.
    scope?: AgentVaultVariableScope;
  };

export type TCreateVariableDTO = TAgentVaultVariableScoped & {
  scope: AgentVaultVariableScope;
  key: string;
  value: string;
};

export type TUpdateVariableDTO = TAgentVaultVariableScoped & { variableId: string; key?: string; value?: string };

export type TVariableByIdDTO = TAgentVaultVariableScoped & { variableId: string };

export type TAgentVaultVariableUsedByService = {
  id: string;
  name: string;
  hostPattern: string;
  accessBundleId: string;
  accessBundleName: string;
};
