import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";

export const CoolifySyncDestinationSchema = BaseSecretSyncSchema(
  z.object({
    autoRedeployServices: z.boolean().optional()
  })
).merge(
  z.object({
    destination: z.literal(SecretSync.Coolify),
    destinationConfig: z.object({
      appId: z.string().trim().min(1, "Application is required"),
      appName: z
        .string()
        .nullish()
        .transform((val) => val || undefined),
      projectId: z
        .string()
        .nullish()
        .transform((val) => val || undefined),
      projectName: z
        .string()
        .nullish()
        .transform((val) => val || undefined),
      environmentId: z.coerce
        .number()
        .int()
        .nullish()
        .transform((val) => val || undefined),
      environmentName: z
        .string()
        .nullish()
        .transform((val) => val || undefined)
    })
  })
);
