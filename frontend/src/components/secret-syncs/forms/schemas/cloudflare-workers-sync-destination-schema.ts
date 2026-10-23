import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";
import { CloudflareWorkersSyncTarget } from "@app/hooks/api/secretSyncs/types/cloudflare-workers-sync";

export const CloudflareWorkersSyncDestinationSchema = BaseSecretSyncSchema(
  z.object({
    syncNonSecretBindings: z.boolean().optional().default(false)
  })
).merge(
  z.object({
    destination: z.literal(SecretSync.CloudflareWorkers),
    destinationConfig: z
      .object({
        scriptId: z
          .string()
          .trim()
          .min(1, "Script ID is required")
          .max(64)
          .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Invalid script ID format"),
        target: z
          .nativeEnum(CloudflareWorkersSyncTarget)
          .optional()
          .default(CloudflareWorkersSyncTarget.Script),
        previewName: z.string().trim().optional()
      })
      .superRefine((config, ctx) => {
        if (config.target === CloudflareWorkersSyncTarget.Preview && !config.previewName) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Preview name is required when targeting a specific Preview.",
            path: ["previewName"]
          });
        }
      })
  })
);
