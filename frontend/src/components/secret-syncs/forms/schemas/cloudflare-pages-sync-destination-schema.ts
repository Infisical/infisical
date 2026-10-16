import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";
import { CloudflarePagesVariableType } from "@app/hooks/api/secretSyncs/types/cloudflare-pages-sync";

export const CloudflarePagesSyncDestinationSchema = BaseSecretSyncSchema(
  z.object({
    variableType: z
      .nativeEnum(CloudflarePagesVariableType)
      .default(CloudflarePagesVariableType.Secret)
  })
).merge(
  z.object({
    destination: z.literal(SecretSync.CloudflarePages),
    destinationConfig: z.object({
      projectName: z.string().trim().min(1, "Project name is required"),
      environment: z.string().trim().min(1, "Environment is required")
    })
  })
);
