import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";

export const KeeperSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Keeper),
    destinationConfig: z.object({
      folderUid: z.string().trim().min(1, "Shared folder required").max(64),
      folderName: z.string().trim().max(255).optional()
    })
  })
);
