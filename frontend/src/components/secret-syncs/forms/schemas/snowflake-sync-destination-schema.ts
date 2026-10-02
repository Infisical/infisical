import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";

export const SnowflakeSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Snowflake),
    destinationConfig: z.object({
      database: z.string().trim().min(1, "Database required"),
      schema: z.string().trim().min(1, "Schema required")
    })
  })
);
