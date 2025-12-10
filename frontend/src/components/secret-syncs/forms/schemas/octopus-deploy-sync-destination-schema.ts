import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { OctopusDeploySyncScope } from "@app/hooks/api/secretSyncs/types/octopus-deploy-sync";

export const OctopusDeploySyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.OctopusDeploy),
    destinationConfig: z.intersection(
      z.object({
        spaceId: z.string().trim().min(1, { message: "Space ID is required" }),
        spaceName: z.string().trim().min(1, { message: "Space Name is required" })
      }),
      z.discriminatedUnion("scope", [
        z.object({
          scope: z.literal(OctopusDeploySyncScope.Project),
          projectId: z.string().trim().min(1, { message: "Project ID is required" }),
          projectName: z.string().trim().min(1, { message: "Project Name is required" }),
          scopeValues: z
            .object({
              environments: z.array(z.string()).optional(),
              roles: z.array(z.string()).optional(),
              machines: z.array(z.string()).optional(),
              processes: z.array(z.string()).optional(),
              actions: z.array(z.string()).optional(),
              channels: z.array(z.string()).optional()
            })
            .optional()
        })
      ])
    )
  })
);
