import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { GiteaSyncScope } from "@app/services/secret-sync/gitea/gitea-sync-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const GiteaSyncDestinationConfigSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(GiteaSyncScope.Repository).describe(SecretSyncs.DESTINATION_CONFIG.GITEA.scope),
    owner: z
      .string()
      .trim()
      .min(1, "Repository owner is required")
      .describe(SecretSyncs.DESTINATION_CONFIG.GITEA.owner),
    repo: z.string().trim().min(1, "Repository name is required").describe(SecretSyncs.DESTINATION_CONFIG.GITEA.repo)
  })
]);

const GiteaSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const GiteaSyncSchema = BaseSecretSyncSchema(SecretSync.Gitea, GiteaSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Gitea),
    destinationConfig: GiteaSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Gitea] }));

export const CreateGiteaSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Gitea,
  GiteaSyncOptionsConfig
).extend({
  destinationConfig: GiteaSyncDestinationConfigSchema
});

export const UpdateGiteaSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Gitea,
  GiteaSyncOptionsConfig
).extend({
  destinationConfig: GiteaSyncDestinationConfigSchema.optional()
});

export const GiteaSyncListItemSchema = z
  .object({
    name: z.literal("Gitea"),
    connection: z.literal(AppConnection.Gitea),
    destination: z.literal(SecretSync.Gitea),
    canImportSecrets: z.literal(false),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Gitea] }));
