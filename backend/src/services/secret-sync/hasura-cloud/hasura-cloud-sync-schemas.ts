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

const HasuraCloudSyncDestinationConfigSchema = z.object({
  projectId: z
    .string()
    .trim()
    .min(1, "Hasura Cloud project ID required")
    .describe(SecretSyncs.DESTINATION_CONFIG.HASURA_CLOUD.projectId),
  projectName: z.string().trim().describe(SecretSyncs.DESTINATION_CONFIG.HASURA_CLOUD.projectName),
  tenantId: z
    .string()
    .trim()
    .min(1, "Hasura Cloud tenant ID required")
    .describe(SecretSyncs.DESTINATION_CONFIG.HASURA_CLOUD.tenantId)
});

const HasuraCloudSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const HasuraCloudSyncSchema = BaseSecretSyncSchema(SecretSync.HasuraCloud, HasuraCloudSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.HasuraCloud),
    destinationConfig: HasuraCloudSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.HasuraCloud] }));

export const CreateHasuraCloudSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.HasuraCloud,
  HasuraCloudSyncOptionsConfig
).extend({
  destinationConfig: HasuraCloudSyncDestinationConfigSchema
});

export const UpdateHasuraCloudSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.HasuraCloud,
  HasuraCloudSyncOptionsConfig
).extend({
  destinationConfig: HasuraCloudSyncDestinationConfigSchema.optional()
});

export const HasuraCloudSyncListItemSchema = z
  .object({
    name: z.literal("Hasura Cloud"),
    connection: z.literal(AppConnection.HasuraCloud),
    destination: z.literal(SecretSync.HasuraCloud),
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.HasuraCloud] }));
