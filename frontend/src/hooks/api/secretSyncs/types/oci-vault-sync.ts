import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export type TOCIVaultSync = TRootSecretSync & {
  destination: SecretSync.OCIVault;
  destinationConfig: {
    compartmentOcid: string;
    vaultOcid: string;
    keyOcid: string;
  };
  connection: {
    app: AppConnection.OCI;
    name: string;
    id: string;
  };
};
