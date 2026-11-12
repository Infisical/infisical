import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RootSyncOptions, TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TCoolifySync = TRootSecretSync & {
  destination: SecretSync.Coolify;
  destinationConfig: {
    appId: string;
    appName?: string;
    projectId?: string;
    projectName?: string;
    environmentId?: number;
    environmentName?: string;
  };
  connection: {
    app: AppConnection.Coolify;
    name: string;
    id: string;
  };

  syncOptions: RootSyncOptions & {
    autoRedeployServices?: boolean;
  };
};
