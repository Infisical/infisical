import { z } from "zod";

import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AzureKeyVaultSyncDestinationSchema = z.object({
  destination: z.literal(SecretSync.AzureKeyVault),
  destinationConfig: z.object({
    vaultBaseUrl: z.string().min(1, "Vault Base URL required")
  })
});
