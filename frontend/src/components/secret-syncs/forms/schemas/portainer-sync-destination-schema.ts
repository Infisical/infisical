import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const PortainerSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Portainer),
    destinationConfig: z.object({
      environmentId: z
        .number({ invalid_type_error: "Environment is required" })
        .int()
        .positive("Environment is required"),
      stackId: z
        .number({ invalid_type_error: "Stack is required" })
        .int()
        .positive("Stack is required")
    })
  })
);
