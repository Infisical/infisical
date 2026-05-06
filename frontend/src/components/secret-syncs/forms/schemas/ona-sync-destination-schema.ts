import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const OnaSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Ona),
    destinationConfig: z.object({
      projectId: z.string().trim().min(1, "Ona project required"),
      projectName: z.string().trim().optional()
    })
  })
);
