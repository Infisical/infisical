import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";

export const ConvexSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Convex),
    destinationConfig: z.object({
      deploymentUrl: z
        .string()
        .trim()
        .min(1, "Deployment required")
        .url("Invalid Convex deployment URL")
        .max(2048)
        .refine((url) => url.startsWith("https://"), "Deployment URL must use HTTPS")
        .transform((url) => url.replace(/\/+$/, "")),
      deploymentName: z.string().trim().min(1, "Deployment name required").max(255)
    })
  })
);
