import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RenderSyncScope, RenderSyncType } from "@app/hooks/api/secretSyncs/render-sync";

export const RenderSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Render),
    destinationConfig: z.discriminatedUnion("scope", [
      z.object({
        scope: z.literal(RenderSyncScope.Service),
        serviceId: z.string().trim().min(1, "Service is required"),
        serviceName: z.string().trim().optional(),
        type: z.nativeEnum(RenderSyncType)
      })
    ])
  })
);
