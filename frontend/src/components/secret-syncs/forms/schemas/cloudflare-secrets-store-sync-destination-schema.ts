import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";
import { CloudflareSecretsStoreScope } from "@app/hooks/api/secretSyncs/types/cloudflare-secrets-store-sync";

export const CloudflareSecretsStoreSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.CloudflareSecretsStore),
    destinationConfig: z.object({
      storeId: z.string().trim().min(1, "Secrets Store required"),
      storeName: z.string().trim().optional(),
      scopes: z
        .nativeEnum(CloudflareSecretsStoreScope)
        .array()
        .min(1, "At least one scope required")
    })
  })
);
