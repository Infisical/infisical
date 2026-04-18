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

const DevinSyncDestinationConfigSchema = z.object({
  orgId: z.string().trim().min(1, "Organization ID is required").describe(SecretSyncs.DESTINATION_CONFIG.DEVIN.orgId)
});

const DevinSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const DevinSyncSchema = BaseSecretSyncSchema(SecretSync.Devin, DevinSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Devin),
    destinationConfig: DevinSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Devin] }));

export const CreateDevinSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Devin,
  DevinSyncOptionsConfig
).extend({
  destinationConfig: DevinSyncDestinationConfigSchema
});

export const UpdateDevinSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Devin,
  DevinSyncOptionsConfig
).extend({
  destinationConfig: DevinSyncDestinationConfigSchema.optional()
});

export const DevinSyncListItemSchema = z
  .object({
    name: z.literal("Devin"),
    connection: z.literal(AppConnection.Devin),
    destination: z.literal(SecretSync.Devin),
    canImportSecrets: z.literal(false),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Devin] }));
