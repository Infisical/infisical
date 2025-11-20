import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const ChecklySyncDestinationConfigSchema = z.object({
  accountId: z.string().min(1, "Account ID is required").max(255, "Account ID must be less than 255 characters"),
  accountName: z
    .string()
    .min(1, "Account Name is required")
    .max(255, "Account ID must be less than 255 characters")
    .optional(),
  groupId: z.string().min(1, "Group ID is required").max(255, "Group ID must be less than 255 characters").optional(),
  groupName: z
    .string()
    .min(1, "Group Name is required")
    .max(255, "Group Name must be less than 255 characters")
    .optional()
});

const ChecklySyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const ChecklySyncSchema = BaseSecretSyncSchema(SecretSync.Checkly, ChecklySyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Checkly),
    destinationConfig: ChecklySyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Checkly] }));

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

export const ChecklySyncListItemSchema = z
  .object({
    name: z.literal("Checkly"),
    connection: z.literal(AppConnection.Checkly),
    destination: z.literal(SecretSync.Checkly),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Checkly] }));
