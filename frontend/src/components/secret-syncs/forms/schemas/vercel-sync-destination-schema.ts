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
    destinationConfig: z
      .discriminatedUnion("scope", [
        z.object({
          scope: z.literal(VercelSyncScope.Project),
          app: z.string().trim().min(1, "Project required"),
          appName: z.string().trim().min(1, "Project required"),
          env: z.nativeEnum(VercelEnvironmentType).or(z.string()),
          branch: z.string().trim().optional(),
          teamId: z.string().trim(),
          sensitive: z.boolean().default(false)
        }),
        z.object({
          scope: z.literal(VercelSyncScope.Team),
          teamId: z.string().trim().min(1, "Team required"),
          teamName: z.string().trim().optional(),
          targetEnvironments: z.array(z.nativeEnum(VercelEnvironmentType)).optional().default([]),
          applyToAllCustomEnvironments: z.boolean().optional().default(false),
          targetProjects: z.array(z.string()).optional(),
          sensitive: z.boolean().default(false)
        })
      ])
      .superRefine((config, ctx) => {
        if (
          config.scope === VercelSyncScope.Team &&
          !config.targetEnvironments?.length &&
          !config.applyToAllCustomEnvironments
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "At least one target environment or Apply to All Custom Environments must be set.",
            path: ["targetEnvironments"]
          });
        }

        if (!config.sensitive) return;

        if (
          config.scope === VercelSyncScope.Project &&
          config.env === VercelEnvironmentType.Development
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Marking secrets as sensitive in Vercel is not supported for development environments.",
            path: ["sensitive"]
          });
        }
      })
  })
);
