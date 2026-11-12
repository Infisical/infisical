import z from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

export const COOLIFY_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const COOLIFY_ENV_KEY_RULE =
  "Coolify environment variable names must start with a letter or underscore and contain only letters, digits, and underscores.";

const isCoolifyCompatibleKeySchema = (keySchema?: string) =>
  !keySchema || COOLIFY_ENV_KEY_PATTERN.test(keySchema.replace(/\{\{secretKey\}\}|\{\{environment\}\}/g, "A"));

const hasCoolifyCompatibleKeySchema = (val: { syncOptions?: { keySchema?: string } }) =>
  isCoolifyCompatibleKeySchema(val.syncOptions?.keySchema);

const COOLIFY_KEY_SCHEMA_ERROR = {
  message: `Key schema produces names Coolify rejects. ${COOLIFY_ENV_KEY_RULE}`,
  path: ["syncOptions", "keySchema"]
};

const CoolifySyncOptionsSchema = z.object({
  autoRedeployServices: z
    .boolean()
    .optional()
    .describe(SecretSyncs.ADDITIONAL_SYNC_OPTIONS.COOLIFY.autoRedeployServices)
});

const CoolifySyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

const CoolifySyncDestinationConfigSchema = z.object({
  appId: z
    .string()
    .trim()
    .min(1, "Application ID is required")
    .max(255)
    .describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.applicationId),
  appName: z.string().trim().max(255).optional().describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.appName),
  projectId: z.string().trim().max(255).optional().describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.projectId),
  projectName: z.string().trim().max(255).optional().describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.projectName),
  environmentId: z.coerce.number().int().optional().describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.environmentId),
  environmentName: z
    .string()
    .trim()
    .max(255)
    .optional()
    .describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.environmentName)
});

export const CoolifySyncSchema = BaseSecretSyncSchema(
  SecretSync.Coolify,
  CoolifySyncOptionsConfig,
  CoolifySyncOptionsSchema
).extend({
  destination: z.literal(SecretSync.Coolify),
  destinationConfig: CoolifySyncDestinationConfigSchema
});

export const CreateCoolifySyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Coolify,
  CoolifySyncOptionsConfig,
  CoolifySyncOptionsSchema
)
  .extend({
    destinationConfig: CoolifySyncDestinationConfigSchema
  })
  .refine(hasCoolifyCompatibleKeySchema, COOLIFY_KEY_SCHEMA_ERROR);

export const UpdateCoolifySyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Coolify,
  CoolifySyncOptionsConfig,
  CoolifySyncOptionsSchema
)
  .extend({
    destinationConfig: CoolifySyncDestinationConfigSchema.optional()
  })
  .refine(hasCoolifyCompatibleKeySchema, COOLIFY_KEY_SCHEMA_ERROR);

export const CoolifySyncListItemSchema = z.object({
  name: z.literal("Coolify"),
  connection: z.literal(AppConnection.Coolify),
  destination: z.literal(SecretSync.Coolify),
  canImportSecrets: z.literal(true)
});
