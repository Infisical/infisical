import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const ChefSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Chef),
    destinationConfig: z.object({
      dataBagName: z.string().trim().min(1, "Data Bag required"),
      dataBagItemName: z.string().trim().min(1, "Data Bag Item required")
    })
  })
);
