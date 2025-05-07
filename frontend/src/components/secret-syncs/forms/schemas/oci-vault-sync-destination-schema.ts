import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const OCIVaultSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.OCIVault),
    destinationConfig: z.object({
      compartmentOcid: z.string().trim().min(1, "Compartment OCID required"),
      vaultOcid: z.string().trim().min(1, "Vault OCID required"),
      keyOcid: z.string().trim().min(1, "Key OCID required")
    })
  })
);
