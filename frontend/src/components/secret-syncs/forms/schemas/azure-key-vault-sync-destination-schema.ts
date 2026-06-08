import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { AzureKeyVaultSyncMappingBehavior } from "@app/hooks/api/secretSyncs/types/azure-key-vault-sync";

export const AzureKeyVaultSyncDestinationSchema = BaseSecretSyncSchema(
  z.object({
    disableCertificateImport: z.boolean().optional().default(false)
  })
).merge(
  z.object({
    destination: z.literal(SecretSync.AzureKeyVault),
    destinationConfig: z
      .discriminatedUnion("mappingBehavior", [
        z.object({
          mappingBehavior: z.literal(AzureKeyVaultSyncMappingBehavior.OneToOne)
        }),
        z.object({
          mappingBehavior: z.literal(AzureKeyVaultSyncMappingBehavior.ManyToOne),
          secretName: z
            .string()
            .regex(
              /^[a-zA-Z0-9-]+$/,
              "Secret name must contain only alphanumeric characters and hyphens"
            )
            .min(1, "Secret name is required")
            .max(127, "Secret name cannot exceed 127 characters")
        })
      ])
      .and(
        z.object({
          vaultBaseUrl: z
            .string()
            .url("Invalid vault base URL format")
            .min(1, "Vault base URL required")
        })
      )
  })
);
