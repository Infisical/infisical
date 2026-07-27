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

const SpaceliftSyncDestinationConfigSchema = z.object({
  contextId: z
    .string()
    .trim()
    .min(1, "Context ID is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.SPACELIFT.contextId),
  contextName: z
    .string()
    .trim()
    .min(1, "Context name is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.SPACELIFT.contextName)
});

const SpaceliftSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const SpaceliftSyncSchema = BaseSecretSyncSchema(SecretSync.Spacelift, SpaceliftSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Spacelift),
    destinationConfig: SpaceliftSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Spacelift] }));

export const CreateSpaceliftSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Spacelift,
  SpaceliftSyncOptionsConfig
).extend({
  destinationConfig: SpaceliftSyncDestinationConfigSchema
});

export const UpdateSpaceliftSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Spacelift,
  SpaceliftSyncOptionsConfig
).extend({
  destinationConfig: SpaceliftSyncDestinationConfigSchema.optional()
});

export const SpaceliftSyncListItemSchema = z
  .object({
    name: z.literal("Spacelift"),
    connection: z.literal(AppConnection.Spacelift),
    destination: z.literal(SecretSync.Spacelift),
    canImportSecrets: z.literal(false),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Spacelift] }));
