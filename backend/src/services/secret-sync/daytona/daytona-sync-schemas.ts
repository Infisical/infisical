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

const DaytonaSyncDestinationConfigSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(1, "Organization name is required")
    .max(255)
    .describe(SecretSyncs.DESTINATION_CONFIG.DAYTONA.organizationName)
});

const DaytonaSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const DaytonaSyncSchema = BaseSecretSyncSchema(SecretSync.Daytona, DaytonaSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Daytona),
    destinationConfig: DaytonaSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Daytona] }));

export const CreateDaytonaSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Daytona,
  DaytonaSyncOptionsConfig
).extend({
  destinationConfig: DaytonaSyncDestinationConfigSchema
});

export const UpdateDaytonaSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Daytona,
  DaytonaSyncOptionsConfig
).extend({
  destinationConfig: DaytonaSyncDestinationConfigSchema.optional()
});

export const DaytonaSyncListItemSchema = z
  .object({
    name: z.literal("Daytona"),
    connection: z.literal(AppConnection.Daytona),
    destination: z.literal(SecretSync.Daytona),
    canImportSecrets: z.literal(false),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Daytona] }));
