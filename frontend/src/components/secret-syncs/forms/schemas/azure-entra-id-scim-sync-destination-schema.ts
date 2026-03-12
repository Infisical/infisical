import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AzureEntraIdScimSyncDestinationSchema = BaseSecretSyncSchema(
  z.object({
    secretKey: z.string().optional()
  })
).merge(
  z.object({
    destination: z.literal(SecretSync.AzureEntraIdScim),
    destinationConfig: z.object({
      servicePrincipalId: z.string().trim().min(1, "Service Principal ID required")
    })
  })
);
