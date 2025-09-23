import { AppConnection } from "@app/hooks/api/appConnections";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

export const PKI_SYNC_MAP: Record<
  PkiSync,
  {
    name: string;
    image: string;
  }
> = {
  [PkiSync.AzureKeyVault]: {
    name: "Azure Key Vault",
    image: "Microsoft Azure.png"
  }
};

export const PKI_SYNC_CONNECTION_MAP: Record<PkiSync, AppConnection> = {
  [PkiSync.AzureKeyVault]: AppConnection.AzureKeyVault
};
