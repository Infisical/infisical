import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TChefSync = TRootSecretSync & {
  destination: SecretSync.Chef;
  destinationConfig: {
    dataBagName: string;
    dataBagItemName: string;
  };
  connection: {
    app: AppConnection.Chef;
    name: string;
    id: string;
  };
};
