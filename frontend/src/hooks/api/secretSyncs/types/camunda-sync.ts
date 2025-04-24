import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum CamundaSyncScope {
  Cluster = "cluster"
}

export type TCamundaSync = TRootSecretSync & {
  destination: SecretSync.Camunda;
  destinationConfig: {
    scope: string;
    clusterUUID: string;
    clusterName?: string;
  };
  connection: {
    app: AppConnection.Camunda;
    name: string;
    id: string;
  };
};
