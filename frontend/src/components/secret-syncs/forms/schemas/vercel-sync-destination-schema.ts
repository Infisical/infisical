import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { VercelEnvironmentType } from "@app/hooks/api/secretSyncs/types/vercel-sync";

export const VercelSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Vercel),
    destinationConfig: z.object({
      app: z.string().trim().min(1, "Project required"),
      appName: z.string().trim().min(1, "Project required"),
      env: z.nativeEnum(VercelEnvironmentType).or(z.string()),
      branch: z.string().trim().optional(),
      teamId: z.string().trim()
    })
  })
);
