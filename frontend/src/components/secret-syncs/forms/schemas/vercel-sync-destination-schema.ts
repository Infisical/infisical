import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import {
  VercelEnvironmentType,
  VercelSyncScope
} from "@app/hooks/api/secretSyncs/types/vercel-sync";

export const VercelSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Vercel),
    destinationConfig: z.discriminatedUnion("scope", [
      z.object({
        scope: z.literal(VercelSyncScope.Project),
        app: z.string().trim().min(1, "Project required"),
        appName: z.string().trim().min(1, "Project required"),
        env: z.nativeEnum(VercelEnvironmentType).or(z.string()),
        branch: z.string().trim().optional(),
        teamId: z.string().trim()
      }),
      z.object({
        scope: z.literal(VercelSyncScope.Team),
        teamId: z.string().trim().min(1, "Team required"),
        teamName: z.string().trim().optional(),
        targetEnvironments: z
          .array(z.nativeEnum(VercelEnvironmentType), {
            message: "At least one environment is required"
          })
          .min(1, "At least one environment is required"),
        targetProjects: z.array(z.string()).optional()
      })
    ])
  })
);
