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
import { TriggerDevEnvironment } from "./trigger-dev-sync-constants";

const TriggerDevSyncDestinationConfigSchema = z.object({
  projectRef: z
    .string()
    .trim()
    .min(1, "Project Ref is required")
    .max(255, "Project Ref must be less than 255 characters")
    .describe(SecretSyncs.DESTINATION_CONFIG.TRIGGER_DEV.projectRef),
  environment: z
    .nativeEnum(TriggerDevEnvironment)
    .describe(SecretSyncs.DESTINATION_CONFIG.TRIGGER_DEV.environment)
});

const TriggerDevSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const TriggerDevSyncSchema = BaseSecretSyncSchema(SecretSync.TriggerDev, TriggerDevSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.TriggerDev),
    destinationConfig: TriggerDevSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.TriggerDev] }));

export const CreateTriggerDevSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.TriggerDev,
  TriggerDevSyncOptionsConfig
).extend({
  destinationConfig: TriggerDevSyncDestinationConfigSchema
});

export const UpdateTriggerDevSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.TriggerDev,
  TriggerDevSyncOptionsConfig
).extend({
  destinationConfig: TriggerDevSyncDestinationConfigSchema.optional()
});

export const TriggerDevSyncListItemSchema = z
  .object({
    name: z.literal("Trigger.dev"),
    connection: z.literal(AppConnection.TriggerDev),
    destination: z.literal(SecretSync.TriggerDev),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.TriggerDev] }));
