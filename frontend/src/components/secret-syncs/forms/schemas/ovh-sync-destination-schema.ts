import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const OvhSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.OVH),
    destinationConfig: z.object({
      path: z
        .string()
        .trim()
        .min(1, "Path required")
        .transform((val) => val.trim().replace(/^\/+|\/+$/g, ""))
        .refine((val) => /^([a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+$/.test(val), {
          message:
            "Invalid OVH OKMS path format. Use alphanumerics, dots, dashes, underscores, and single slashes between segments."
        })
    })
  })
);
