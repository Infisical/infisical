import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AzureKeyVaultSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.AzureKeyVault),
    destinationConfig: z.object({
      vaultBaseUrl: z
        .string()
        .url("Invalid vault base URL format")
        .min(1, "Vault base URL required")
    })
  })
);
