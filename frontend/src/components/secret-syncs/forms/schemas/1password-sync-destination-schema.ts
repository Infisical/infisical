import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const OnePassSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.OnePass),
    destinationConfig: z.object({
      vaultId: z.string().trim().min(1, "Vault ID required"),
      valueLabel: z.string().trim().optional()
    })
  })
);
