import { useFormContext } from "react-hook-form";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { AzureKeyVaultPkiSyncFields } from "./AzureKeyVaultPkiSyncFields";
import { TPkiSyncForm } from "./schemas";

export const PkiSyncDestinationFields = () => {
  const { watch } = useFormContext<TPkiSyncForm>();

  const destination = watch("destination");

  switch (destination) {
    case PkiSync.AzureKeyVault:
      return <AzureKeyVaultPkiSyncFields />;
    default:
      throw new Error(`Unhandled Destination Config Field: ${destination}`);
  }
};
