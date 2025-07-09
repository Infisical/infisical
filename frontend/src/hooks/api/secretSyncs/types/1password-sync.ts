import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TOnePassSync = TRootSecretSync & {
  destination: SecretSync.OnePass;
  destinationConfig: {
    vaultId: string;
    valueLabel?: string;
  };
  connection: {
    app: AppConnection.OnePass;
    name: string;
    id: string;
  };
};
