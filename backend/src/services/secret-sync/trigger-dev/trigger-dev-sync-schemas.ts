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

const TriggerDevSyncDestinationConfigSchema = z.object({
  projectRef: z
    .string()
    .trim()
    .min(1, "Project reference required")
    .max(255)
    .describe(SecretSyncs.DESTINATION_CONFIG.TRIGGER_DEV.projectRef),
  // The environment slug is validated dynamically against the project's available environments
  // (fetched from Trigger.dev) rather than a hardcoded enum, so new environments work automatically.
  environment: z
    .string()
    .trim()
    .min(1, "Environment required")
    .describe(SecretSyncs.DESTINATION_CONFIG.TRIGGER_DEV.environment)
});

const TriggerDevSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

const TriggerDevSyncOptionsSchema = z.object({
  markAsSecret: z.boolean().optional().describe(SecretSyncs.ADDITIONAL_SYNC_OPTIONS.TRIGGER_DEV.markAsSecret)
});

export const TriggerDevSyncSchema = BaseSecretSyncSchema(
  SecretSync.TriggerDev,
  TriggerDevSyncOptionsConfig,
  TriggerDevSyncOptionsSchema
)
  .extend({
    destination: z.literal(SecretSync.TriggerDev),
    destinationConfig: TriggerDevSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.TriggerDev] }));

export const CreateTriggerDevSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.TriggerDev,
  TriggerDevSyncOptionsConfig,
  TriggerDevSyncOptionsSchema
).extend({
  destinationConfig: TriggerDevSyncDestinationConfigSchema
});

export const UpdateTriggerDevSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.TriggerDev,
  TriggerDevSyncOptionsConfig,
  TriggerDevSyncOptionsSchema
).extend({
  destinationConfig: TriggerDevSyncDestinationConfigSchema.optional()
});

export const TriggerDevSyncListItemSchema = z
  .object({
    name: z.literal("Trigger.dev"),
    connection: z.literal(AppConnection.TriggerDev),
    destination: z.literal(SecretSync.TriggerDev),
    canImportSecrets: z.literal(false),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.TriggerDev] }));
