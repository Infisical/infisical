import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum AzureKeyVaultSyncMappingBehavior {
  OneToOne = "one-to-one",
  ManyToOne = "many-to-one"
}

export type TAzureKeyVaultSync = TRootSecretSync & {
  destination: SecretSync.AzureKeyVault;
  destinationConfig:
    | {
        mappingBehavior: AzureKeyVaultSyncMappingBehavior.OneToOne;
        vaultBaseUrl: string;
      }
    | {
        mappingBehavior: AzureKeyVaultSyncMappingBehavior.ManyToOne;
        vaultBaseUrl: string;
        secretName: string;
      };
  syncOptions: TRootSecretSync["syncOptions"] & {
    disableCertificateImport?: boolean;
  };
  connection: {
    app: AppConnection.AzureKeyVault;
    name: string;
    id: string;
  };
};
