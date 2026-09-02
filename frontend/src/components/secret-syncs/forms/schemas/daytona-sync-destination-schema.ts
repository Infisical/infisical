import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const DaytonaSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Daytona),
    // Daytona has no destination fields, so nothing seeds this object. Without a default it stays
    // undefined and the destination step fails validation with no field to surface the error on.
    destinationConfig: z.object({}).default({})
  })
);
