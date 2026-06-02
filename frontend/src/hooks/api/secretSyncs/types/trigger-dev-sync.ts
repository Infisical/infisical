import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RootSyncOptions, TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum TriggerDevSyncEnvironment {
  Production = "prod",
  Staging = "staging",
  Development = "dev",
  Preview = "preview"
}

export type TTriggerDevSync = TRootSecretSync & {
  destination: SecretSync.TriggerDev;
  destinationConfig: {
    projectRef: string;
    environment: TriggerDevSyncEnvironment;
  };
  connection: {
    app: AppConnection.TriggerDev;
    name: string;
    id: string;
  };

  syncOptions: RootSyncOptions & {
    secret?: boolean;
  };
};
