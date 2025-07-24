/* eslint-disable @typescript-eslint/no-empty-object-type */
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TDigitalOceanAppPlatformSync = TRootSecretSync & {
  destination: SecretSync.DigitalOceanAppPlatform;
  destinationConfig: {
    appId: string;
    appName: string;
  };
  connection: {
    app: AppConnection.DigitalOcean;
    name: string;
    id: string;
  };
};
