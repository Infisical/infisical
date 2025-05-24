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

const OnePassSyncDestinationConfigSchema = z.object({
  vaultId: z.string().trim().min(1, "Vault required").describe(SecretSyncs.DESTINATION_CONFIG.ONEPASS.vaultId)
});

const OnePassSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const OnePassSyncSchema = BaseSecretSyncSchema(SecretSync.OnePass, OnePassSyncOptionsConfig).extend({
  destination: z.literal(SecretSync.OnePass),
  destinationConfig: OnePassSyncDestinationConfigSchema
});

export const CreateOnePassSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.OnePass,
  OnePassSyncOptionsConfig
).extend({
  destinationConfig: OnePassSyncDestinationConfigSchema
});

export const UpdateOnePassSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.OnePass,
  OnePassSyncOptionsConfig
).extend({
  destinationConfig: OnePassSyncDestinationConfigSchema.optional()
});

export const OnePassSyncListItemSchema = z.object({
  name: z.literal("1Password"),
  connection: z.literal(AppConnection.OnePass),
  destination: z.literal(SecretSync.OnePass),
  canImportSecrets: z.literal(true)
});
