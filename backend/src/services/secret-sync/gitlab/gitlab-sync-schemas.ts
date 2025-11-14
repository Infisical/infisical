import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { GitLabSyncScope } from "./gitlab-sync-enums";

const GitLabSyncDestinationConfigSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(GitLabSyncScope.Project).describe(SecretSyncs.DESTINATION_CONFIG.GITLAB.scope),
    projectId: z.string().min(1, "Project ID is required").describe(SecretSyncs.DESTINATION_CONFIG.GITLAB.projectId),
    projectName: z
      .string()
      .min(1, "Project name is required")
      .describe(SecretSyncs.DESTINATION_CONFIG.GITLAB.projectName),
    targetEnvironment: z
      .string()
      .optional()
      .default("*")
      .describe(SecretSyncs.DESTINATION_CONFIG.GITLAB.targetEnvironment),
    shouldProtectSecrets: z
      .boolean()
      .optional()
      .default(false)
      .describe(SecretSyncs.DESTINATION_CONFIG.GITLAB.shouldProtectSecrets),
    shouldMaskSecrets: z
      .boolean()
      .optional()
      .default(false)
      .describe(SecretSyncs.DESTINATION_CONFIG.GITLAB.shouldMaskSecrets),
    shouldHideSecrets: z
      .boolean()
      .optional()
      .default(false)
      .describe(SecretSyncs.DESTINATION_CONFIG.GITLAB.shouldHideSecrets)
  }),
  z.object({
    scope: z.literal(GitLabSyncScope.Group).describe(SecretSyncs.DESTINATION_CONFIG.GITLAB.scope),
    groupId: z.string().min(1, "Group ID is required").describe(SecretSyncs.DESTINATION_CONFIG.GITLAB.groupId),
    groupName: z.string().min(1, "Group name is required").describe(SecretSyncs.DESTINATION_CONFIG.GITLAB.groupName),
    targetEnvironment: z
      .string()
      .optional()
      .default("*")
      .describe(SecretSyncs.DESTINATION_CONFIG.GITLAB.targetEnvironment),
    shouldProtectSecrets: z
      .boolean()
      .optional()
      .default(false)
      .describe(SecretSyncs.DESTINATION_CONFIG.GITLAB.shouldProtectSecrets),
    shouldMaskSecrets: z
      .boolean()
      .optional()
      .default(false)
      .describe(SecretSyncs.DESTINATION_CONFIG.GITLAB.shouldMaskSecrets),
    shouldHideSecrets: z
      .boolean()
      .optional()
      .default(false)
      .describe(SecretSyncs.DESTINATION_CONFIG.GITLAB.shouldHideSecrets)
  })
]);

const GitLabSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const GitLabSyncSchema = BaseSecretSyncSchema(SecretSync.GitLab, GitLabSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.GitLab),
    destinationConfig: GitLabSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.GitLab] }));

export const CreateGitLabSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.GitLab,
  GitLabSyncOptionsConfig
).extend({
  destinationConfig: GitLabSyncDestinationConfigSchema
});

export const UpdateGitLabSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.GitLab,
  GitLabSyncOptionsConfig
).extend({
  destinationConfig: GitLabSyncDestinationConfigSchema.optional()
});

export const GitLabSyncListItemSchema = z
  .object({
    name: z.literal("GitLab"),
    connection: z.literal(AppConnection.GitLab),
    destination: z.literal(SecretSync.GitLab),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.GitLab] }));
