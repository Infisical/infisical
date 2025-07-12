/* eslint-disable @typescript-eslint/no-empty-object-type */
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TChecklySync = TRootSecretSync & {
  destination: SecretSync.Checkly;
  destinationConfig: {
    accountId: string;
    accountName: string;
  };
  connection: {
    app: AppConnection.Checkly;
    name: string;
    id: string;
  };
};
