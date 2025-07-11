import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TRailwaySync = TRootSecretSync & {
  destination: SecretSync.Railway;
  destinationConfig: {
    projectId: string;
    projectName: string;

    environmentName: string;
    environmentId: string;

    serviceId?: string;
    serviceName?: string;
  };
  connection: {
    app: AppConnection.Railway;
    name: string;
    id: string;
  };
};
