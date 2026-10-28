import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";
import { DenoDeploySyncContext } from "@app/hooks/api/secretSyncs/types/deno-deploy-sync";

export const DenoDeploySyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.DenoDeploy),
    destinationConfig: z.object({
      appId: z.string().trim().min(1, "App required").max(255),
      appSlug: z.string().trim().min(1, "App slug required").max(32),
      context: z.nativeEnum(DenoDeploySyncContext).default(DenoDeploySyncContext.Production)
    })
  })
);
