import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { CoolifyResourceType } from "@app/hooks/api/appConnections/coolify/types";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";
import { CoolifySyncScope } from "@app/hooks/api/secretSyncs/types/coolify-sync";

export const CoolifySyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Coolify),
    destinationConfig: z.object({
      resourceType: z.nativeEnum(CoolifyResourceType),
      resourceId: z.string().trim().min(1, "Resource is required"),
      resourceName: z.string(),
      scope: z.nativeEnum(CoolifySyncScope)
    })
  })
);
