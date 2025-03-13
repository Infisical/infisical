import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { HumanitecSyncScope } from "@app/hooks/api/secretSyncs/types/humanitec-sync";

export const HumanitecSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Humanitec),
    destinationConfig: z.discriminatedUnion("scope", [
      z.object({
        scope: z.literal(HumanitecSyncScope.Application),
        org: z.string().trim().min(1, "Organization required"),
        app: z.string().trim().min(1, "Application required")
      }),
      z.object({
        scope: z.literal(HumanitecSyncScope.Environment),
        org: z.string().trim().min(1, "Organization required"),
        app: z.string().trim().min(1, "Application required"),
        env: z.string().trim().min(1, "Environment required")
      })
    ])
  })
);
