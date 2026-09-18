import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RootSyncOptions, TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TCloudflareWorkersSync = TRootSecretSync & {
  destination: SecretSync.CloudflareWorkers;
  destinationConfig: {
    scriptId: string;
  };
  connection: {
    app: AppConnection.Cloudflare;
    name: string;
    id: string;
  };
  syncOptions: RootSyncOptions & {
    syncNonSecretBindings?: boolean;
  };
};
