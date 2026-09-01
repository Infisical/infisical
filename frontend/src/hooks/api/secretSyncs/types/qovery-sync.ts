import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum QoveryVariableType {
  Secret = "secret",
  Variable = "variable"
}

export type TQoverySync = TRootSecretSync & {
  destination: SecretSync.Qovery;
  // Scope is derived from `environmentId`: project scope when omitted, environment scope otherwise.
  destinationConfig: {
    organizationId: string;
    organizationName?: string;
    projectId: string;
    projectName?: string;
    environmentId?: string;
    environmentName?: string;
    variableType: QoveryVariableType;
  };
  connection: {
    app: AppConnection.Qovery;
    name: string;
    id: string;
  };
};
