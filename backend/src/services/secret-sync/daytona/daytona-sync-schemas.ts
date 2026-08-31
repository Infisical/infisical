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

export const DAYTONA_SECRET_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
export const DAYTONA_SECRET_NAME_RULE =
  "Daytona secret names must start with a letter or underscore and contain only letters, digits, hyphens and underscores.";

// A key schema is applied to every synced key, so literal characters Daytona rejects (a slash, a
// leading digit) would produce a sync that saves cleanly and then fails on every run. Placeholders
// are substituted with a token that is itself valid so only the schema's literals are under test;
// the resolved names are checked again at sync time.
const isDaytonaCompatibleKeySchema = (keySchema?: string) =>
  !keySchema || DAYTONA_SECRET_NAME_PATTERN.test(keySchema.replace(/\{\{secretKey\}\}|\{\{environment\}\}/g, "A"));

const hasDaytonaCompatibleKeySchema = (val: { syncOptions?: { keySchema?: string } }) =>
  isDaytonaCompatibleKeySchema(val.syncOptions?.keySchema);

const DAYTONA_KEY_SCHEMA_ERROR = {
  message: `Key schema produces names Daytona rejects. ${DAYTONA_SECRET_NAME_RULE}`,
  path: ["syncOptions", "keySchema"]
};

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

export const CreateDaytonaSyncSchema = GenericCreateSecretSyncFieldsSchema(SecretSync.Daytona, DaytonaSyncOptionsConfig)
  .extend({
    destinationConfig: DaytonaSyncDestinationConfigSchema
  })
  .refine(hasDaytonaCompatibleKeySchema, DAYTONA_KEY_SCHEMA_ERROR);

export const UpdateDaytonaSyncSchema = GenericUpdateSecretSyncFieldsSchema(SecretSync.Daytona, DaytonaSyncOptionsConfig)
  .extend({
    destinationConfig: DaytonaSyncDestinationConfigSchema.optional()
  })
  .refine(hasDaytonaCompatibleKeySchema, DAYTONA_KEY_SCHEMA_ERROR);

export const DaytonaSyncListItemSchema = z
  .object({
    name: z.literal("Daytona"),
    connection: z.literal(AppConnection.Daytona),
    destination: z.literal(SecretSync.Daytona),
    canImportSecrets: z.literal(false),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Daytona] }));
