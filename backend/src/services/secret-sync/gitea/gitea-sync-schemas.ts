import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { GiteaSyncScope } from "./gitea-sync-enums";

const GiteaSyncDestinationConfigSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(GiteaSyncScope.Organization).describe(SecretSyncs.DESTINATION_CONFIG.GITEA.scope),
    org: z.object({
      name: z.string().min(1, "Organization name required").describe(SecretSyncs.DESTINATION_CONFIG.GITEA.org),
      fullName: z
        .string()
        .min(1, "Organization full name required")
        .describe(SecretSyncs.DESTINATION_CONFIG.GITEA.orgFull)
    })
  }),
  z.object({
    scope: z.literal(GiteaSyncScope.Repository).describe(SecretSyncs.DESTINATION_CONFIG.GITEA.scope),
    owner: z.string().min(1, "Repository owner name required").describe(SecretSyncs.DESTINATION_CONFIG.GITEA.owner),
    repo: z.string().min(1, "Repository name required").describe(SecretSyncs.DESTINATION_CONFIG.GITEA.repo)
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
    canRemoveSecretsOnDeletion: z.literal(true),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Gitea] }));
