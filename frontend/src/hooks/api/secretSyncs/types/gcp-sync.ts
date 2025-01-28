import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum GcpSyncScope {
  Global = "global"
}

export type TGcpSync = TRootSecretSync & {
  destination: SecretSync.GCPSecretManager;
  destinationConfig: {
    scope: GcpSyncScope.Global;
    projectId: string;
  };
  connection: {
    app: AppConnection.GCP;
    name: string;
    id: string;
  };
};
