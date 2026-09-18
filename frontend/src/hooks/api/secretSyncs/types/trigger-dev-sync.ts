import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RootSyncOptions, TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TTriggerDevSync = TRootSecretSync & {
  destination: SecretSync.TriggerDev;
  destinationConfig: {
    projectRef: string;
    // Environment slug fetched from the connected Trigger.dev project (e.g. "dev", "stg", "prod", "preview")
    environment: string;
  };
  connection: {
    app: AppConnection.TriggerDev;
    name: string;
    id: string;
  };

  syncOptions: RootSyncOptions & {
    markAsSecret?: boolean;
  };
};
