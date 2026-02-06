import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RootSyncOptions, TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TFlyioSync = TRootSecretSync & {
  destination: SecretSync.Flyio;
  destinationConfig: {
    appId: string;
    appName?: string;
  };
  connection: {
    app: AppConnection.Flyio;
    name: string;
    id: string;
  };

  syncOptions: RootSyncOptions & {
    autoRedeploy?: boolean;
  };
};
