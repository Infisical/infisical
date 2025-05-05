import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type THCVaultSync = TRootSecretSync & {
  destination: SecretSync.HCVault;
  destinationConfig: {
    mount: string;
    path: string;
  };
  connection: {
    app: AppConnection.HCVault;
    name: string;
    id: string;
  };
};
