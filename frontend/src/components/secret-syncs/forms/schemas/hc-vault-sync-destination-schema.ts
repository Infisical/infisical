import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const HCVaultSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.HCVault),
    destinationConfig: z.object({
      mount: z.string().trim().min(1, "Secrets Engine Mount required"),
      path: z
        .string()
        .trim()
        .min(1, "Path required")
        .transform((val) => val.trim().replace(/^\/+|\/+$/g, "")) // removes leading/trailing slashes
        .refine((val) => /^([a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+$/.test(val), {
          message:
            "Invalid Vault path format. Use alphanumerics, dots, dashes, underscores, and single slashes between segments."
        })
    })
  })
);
