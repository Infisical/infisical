import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AzureEntraIdScimSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.AzureEntraIdScim),
    destinationConfig: z.object({
      servicePrincipalId: z.string().trim().min(1, "Service Principal ID required"),
      secretKey: z.string().trim().min(1, "Secret key required")
    })
  })
);
