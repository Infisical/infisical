import RE2 from "re2";
import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { CoolifyResourceType } from "@app/services/app-connection/coolify/coolify-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const COOLIFY_ENV_VAR_NAME_PATTERN = new RE2(/^[A-Za-z_][A-Za-z0-9_.]{0,254}$/);
// Coolify generates and manages these itself, such as a service's database password, and lets the API
// delete them even though the service breaks without them
const COOLIFY_MANAGED_ENV_VAR_PREFIX = "SERVICE_";

export const isManagedByCoolify = (name: string) => name.startsWith(COOLIFY_MANAGED_ENV_VAR_PREFIX);

export const COOLIFY_ENV_VAR_NAME_RULE = `Coolify environment variable names must start with a letter or underscore, contain only letters, digits, underscores and periods, and be at most 255 characters. Names starting with ${COOLIFY_MANAGED_ENV_VAR_PREFIX} are managed by Coolify and can't be synced.`;

export const isValidCoolifyEnvVarName = (name: string) =>
  COOLIFY_ENV_VAR_NAME_PATTERN.test(name) && !isManagedByCoolify(name);

// A key schema is applied to every synced key, so literal characters Coolify rejects would produce a sync that
// saves cleanly and then fails on every run. Placeholders are substituted with a valid token so only the schema's
// literals are under test; the resolved names are checked again at sync time.
const hasCoolifyCompatibleKeySchema = ({ syncOptions }: { syncOptions?: { keySchema?: string } }) =>
  !syncOptions?.keySchema ||
  isValidCoolifyEnvVarName(syncOptions.keySchema.replace(/\{\{secretKey\}\}|\{\{environment\}\}/g, "A"));

const COOLIFY_KEY_SCHEMA_ERROR = {
  message: `Key schema produces names Coolify rejects. ${COOLIFY_ENV_VAR_NAME_RULE}`,
  path: ["syncOptions", "keySchema"]
};

const CoolifySyncDestinationConfigSchema = z.object({
  resourceType: z.nativeEnum(CoolifyResourceType).describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.resourceType),
  resourceId: z
    .string()
    .trim()
    .min(1, "Resource required")
    .max(255)
    .regex(new RE2(/^[A-Za-z0-9_-]+$/), "Resource ID can only contain letters, numbers, underscores and hyphens")
    .describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.resourceId),
  resourceName: z
    .string()
    .trim()
    .min(1, "Resource name required")
    .max(255)
    .describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.resourceName)
});

const CoolifySyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const CoolifySyncSchema = BaseSecretSyncSchema(SecretSync.Coolify, CoolifySyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Coolify),
    destinationConfig: CoolifySyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Coolify] }));

export const CreateCoolifySyncSchema = GenericCreateSecretSyncFieldsSchema(SecretSync.Coolify, CoolifySyncOptionsConfig)
  .extend({
    destinationConfig: CoolifySyncDestinationConfigSchema
  })
  .refine(hasCoolifyCompatibleKeySchema, COOLIFY_KEY_SCHEMA_ERROR);

export const UpdateCoolifySyncSchema = GenericUpdateSecretSyncFieldsSchema(SecretSync.Coolify, CoolifySyncOptionsConfig)
  .extend({
    destinationConfig: CoolifySyncDestinationConfigSchema.optional()
  })
  .refine(hasCoolifyCompatibleKeySchema, COOLIFY_KEY_SCHEMA_ERROR);

export const CoolifySyncListItemSchema = z
  .object({
    name: z.literal("Coolify"),
    connection: z.literal(AppConnection.Coolify),
    destination: z.literal(SecretSync.Coolify),
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Coolify] }));
