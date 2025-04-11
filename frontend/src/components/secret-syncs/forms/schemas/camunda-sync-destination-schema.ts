import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CamundaSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Camunda),
    destinationConfig: z.object({
      scope: z.string().trim().min(1, "Camunda scope required"),
      clusterUUID: z.string().trim().min(1, "Camunda cluster UUID required"),
      clusterName: z.string().optional()
    })
  })
);
