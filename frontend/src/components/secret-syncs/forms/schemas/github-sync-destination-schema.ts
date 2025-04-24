import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import {
  GitHubSyncScope,
  GitHubSyncVisibility
} from "@app/hooks/api/secretSyncs/types/github-sync";

export const GitHubSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.GitHub),
    destinationConfig: z
      .discriminatedUnion("scope", [
        z.object({
          scope: z.literal(GitHubSyncScope.Organization),
          org: z.string().min(1, "Organization name required"),
          visibility: z.nativeEnum(GitHubSyncVisibility),
          selectedRepositoryIds: z.number().array().optional()
        }),
        z.object({
          scope: z.literal(GitHubSyncScope.Repository),
          owner: z.string().min(1, "Repository owner name required"),
          repo: z.string().min(1, "Repository name required")
        }),
        z.object({
          scope: z.literal(GitHubSyncScope.RepositoryEnvironment),
          owner: z.string().min(1, "Repository owner name required"),
          repo: z.string().min(1, "Repository name required"),
          env: z.string().min(1, "Environment name required")
        })
      ])
      .superRefine((options, ctx) => {
        if (options.scope === GitHubSyncScope.Organization) {
          if (
            options.visibility === GitHubSyncVisibility.Selected &&
            !options.selectedRepositoryIds?.length
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Select at least 1 repository",
              path: ["selectedRepositoryIds"]
            });
          }
        }
      })
  })
);
