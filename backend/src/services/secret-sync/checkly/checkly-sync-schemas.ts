import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

const ChecklySyncDestinationConfigSchema = z.object({
  accountId: z.string().min(1, "Account ID is required"),
  accountName: z.string().min(1, "Account Name is required")
});

const ChecklySyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const ChecklySyncSchema = BaseSecretSyncSchema(SecretSync.Checkly, ChecklySyncOptionsConfig).extend({
  destination: z.literal(SecretSync.Checkly),
  destinationConfig: ChecklySyncDestinationConfigSchema
});

export const CreateChecklySyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Checkly,
  ChecklySyncOptionsConfig
).extend({
  destinationConfig: ChecklySyncDestinationConfigSchema
});

export const UpdateChecklySyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Checkly,
  ChecklySyncOptionsConfig
).extend({
  destinationConfig: ChecklySyncDestinationConfigSchema.optional()
});

export const ChecklySyncListItemSchema = z.object({
  name: z.literal("Checkly"),
  connection: z.literal(AppConnection.Checkly),
  destination: z.literal(SecretSync.Checkly),
  canImportSecrets: z.literal(false)
});
