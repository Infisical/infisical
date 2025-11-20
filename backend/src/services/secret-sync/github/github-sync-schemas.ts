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

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const GitHubSyncDestinationConfigSchema = z
  .discriminatedUnion("scope", [
    z.object({
      scope: z.literal(GitHubSyncScope.Organization).describe(SecretSyncs.DESTINATION_CONFIG.GITHUB.scope),
      org: z.string().min(1, "Organization name required").describe(SecretSyncs.DESTINATION_CONFIG.GITHUB.org),
      visibility: z.nativeEnum(GitHubSyncVisibility),
      selectedRepositoryIds: z.number().array().optional()
    }),
    z.object({
      scope: z.literal(GitHubSyncScope.Repository).describe(SecretSyncs.DESTINATION_CONFIG.GITHUB.scope),
      owner: z.string().min(1, "Repository owner name required").describe(SecretSyncs.DESTINATION_CONFIG.GITHUB.owner),
      repo: z.string().min(1, "Repository name required").describe(SecretSyncs.DESTINATION_CONFIG.GITHUB.repo)
    }),
    z.object({
      scope: z.literal(GitHubSyncScope.RepositoryEnvironment).describe(SecretSyncs.DESTINATION_CONFIG.GITHUB.scope),
      owner: z.string().min(1, "Repository owner name required").describe(SecretSyncs.DESTINATION_CONFIG.GITHUB.owner),
      repo: z.string().min(1, "Repository name required").describe(SecretSyncs.DESTINATION_CONFIG.GITHUB.repo),
      env: z.string().min(1, "Environment name required").describe(SecretSyncs.DESTINATION_CONFIG.GITHUB.env)
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

export const GitHubSyncSchema = BaseSecretSyncSchema(SecretSync.GitHub, GitHubSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.GitHub),
    destinationConfig: GitHubSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.GitHub] }));

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

export const GitHubSyncListItemSchema = z
  .object({
    name: z.literal("GitHub"),
    connection: z.literal(AppConnection.GitHub),
    destination: z.literal(SecretSync.GitHub),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.GitHub] }));
