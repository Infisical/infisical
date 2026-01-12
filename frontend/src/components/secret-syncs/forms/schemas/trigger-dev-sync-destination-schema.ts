import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TriggerDevEnvironment } from "@app/hooks/api/secretSyncs/types/trigger-dev-sync";

export const TriggerDevSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.TriggerDev),
    destinationConfig: z.object({
      projectRef: z.string().max(255).min(1, "Project Ref is required"),
      environment: z.nativeEnum(TriggerDevEnvironment)
    })
  })
);
