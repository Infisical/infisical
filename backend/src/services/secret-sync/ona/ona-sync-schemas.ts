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

const OnaSyncDestinationConfigSchema = z.object({
  projectId: z
    .string()
    .trim()
    .min(1, "Ona project ID is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.ONA.projectId),
  projectName: z.string().trim().optional().describe(SecretSyncs.DESTINATION_CONFIG.ONA.projectName)
});

const OnaSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const OnaSyncSchema = BaseSecretSyncSchema(SecretSync.Ona, OnaSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Ona),
    destinationConfig: OnaSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Ona] }));

export const CreateOnaSyncSchema = GenericCreateSecretSyncFieldsSchema(SecretSync.Ona, OnaSyncOptionsConfig).extend({
  destinationConfig: OnaSyncDestinationConfigSchema
});

export const UpdateOnaSyncSchema = GenericUpdateSecretSyncFieldsSchema(SecretSync.Ona, OnaSyncOptionsConfig).extend({
  destinationConfig: OnaSyncDestinationConfigSchema.optional()
});

export const OnaSyncListItemSchema = z
  .object({
    name: z.literal("Ona"),
    connection: z.literal(AppConnection.Ona),
    destination: z.literal(SecretSync.Ona),
    canImportSecrets: z.literal(false),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Ona] }));
