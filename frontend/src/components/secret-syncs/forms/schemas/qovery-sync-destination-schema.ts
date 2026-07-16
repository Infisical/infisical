import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { QoveryVariableType } from "@app/hooks/api/secretSyncs/types/qovery-sync";

export const QoverySyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Qovery),
    destinationConfig: z.object({
      organizationId: z.string().trim().min(1, "Organization required"),
      organizationName: z.string().trim().optional(),
      projectId: z.string().trim().min(1, "Project required"),
      projectName: z.string().trim().optional(),
      // Optional: when set the sync targets the environment, otherwise the project.
      environmentId: z.string().trim().optional(),
      environmentName: z.string().trim().optional(),
      variableType: z.nativeEnum(QoveryVariableType).default(QoveryVariableType.Secret)
    })
  })
);
