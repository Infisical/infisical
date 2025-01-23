import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { GitHubSyncScope, GitHubSyncVisibility } from "@app/services/secret-sync/github/github-sync-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

const GitHubSyncDestinationConfigSchema = z
  .discriminatedUnion("scope", [
    z.object({
      scope: z.literal(GitHubSyncScope.Organization),
      org: z.string().min(1, "Organization name required").describe(SecretSyncs.DESTINATION_CONFIG.GITHUB.ORG),
      visibility: z.nativeEnum(GitHubSyncVisibility),
      selectedRepositoryIds: z.number().array().optional()
    }),
    z.object({
      scope: z.literal(GitHubSyncScope.Repository),
      owner: z.string().min(1, "Repository owner name required").describe(SecretSyncs.DESTINATION_CONFIG.GITHUB.OWNER),
      repo: z.string().min(1, "Repository name required").describe(SecretSyncs.DESTINATION_CONFIG.GITHUB.REPO)
    }),
    z.object({
      scope: z.literal(GitHubSyncScope.RepositoryEnvironment),
      owner: z.string().min(1, "Repository owner name required").describe(SecretSyncs.DESTINATION_CONFIG.GITHUB.OWNER),
      repo: z.string().min(1, "Repository name required").describe(SecretSyncs.DESTINATION_CONFIG.GITHUB.REPO),
      env: z.string().min(1, "Environment name required").describe(SecretSyncs.DESTINATION_CONFIG.GITHUB.ENV)
    })
  ])
  .superRefine((options, ctx) => {
    if (options.scope === GitHubSyncScope.Organization) {
      if (options.visibility === GitHubSyncVisibility.Selected) {
        if (!options.selectedRepositoryIds?.length)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Select at least 1 repository",
            path: ["selectedRepositoryIds"]
          });
        return;
      }

      if (options.selectedRepositoryIds?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Selected repositories is only supported for visibility "Selected"`,
          path: ["selectedRepositoryIds"]
        });
      }
    }
  });

const GitHubSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const GitHubSyncSchema = BaseSecretSyncSchema(SecretSync.GitHub, GitHubSyncOptionsConfig).extend({
  destination: z.literal(SecretSync.GitHub),
  destinationConfig: GitHubSyncDestinationConfigSchema
});

export const CreateGitHubSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.GitHub,
  GitHubSyncOptionsConfig
).extend({
  destinationConfig: GitHubSyncDestinationConfigSchema
});

export const UpdateGitHubSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.GitHub,
  GitHubSyncOptionsConfig
).extend({
  destinationConfig: GitHubSyncDestinationConfigSchema.optional()
});

export const GitHubSyncListItemSchema = z.object({
  name: z.literal("GitHub"),
  connection: z.literal(AppConnection.GitHub),
  destination: z.literal(SecretSync.GitHub),
  canImportSecrets: z.literal(false)
});
