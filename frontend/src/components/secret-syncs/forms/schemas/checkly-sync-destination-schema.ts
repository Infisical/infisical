import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const ChecklySyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Checkly),
    destinationConfig: z.object({
      accountId: z.string(),
      accountName: z.string()
    })
  })
);
