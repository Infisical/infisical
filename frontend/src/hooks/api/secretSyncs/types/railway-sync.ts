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

    // Deprecated single-service fields kept for backward compatibility
    serviceId?: string;
    serviceName?: string;

    // New multi-service fields
    serviceIds?: string[];
    serviceNames?: string[];
  };
  connection: {
    app: AppConnection.Railway;
    name: string;
    id: string;
  };
};
