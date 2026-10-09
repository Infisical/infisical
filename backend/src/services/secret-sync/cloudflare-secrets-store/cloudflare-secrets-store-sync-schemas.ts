import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { CloudflareSecretsStoreScope } from "./cloudflare-secrets-store-sync-constants";

// Cloudflare documents only that names cannot contain spaces; it also rejects dots and percent signs
// with `invalid_secret_name`, and its own examples use letters, digits, underscores and hyphens.
export const CLOUDFLARE_SECRETS_STORE_SECRET_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const CLOUDFLARE_SECRETS_STORE_SECRET_NAME_RULE =
  "Cloudflare Secrets Store secret names can only contain letters, digits, hyphens and underscores.";

// A key schema is applied to every synced key, so literal characters Cloudflare rejects (a dot, a space)
// would produce a sync that saves cleanly and then fails on every run. Placeholders are substituted with
// a token that is itself valid so only the schema's literals are under test; the resolved names are
// checked again at sync time.
const isCloudflareSecretsStoreCompatibleKeySchema = (keySchema?: string) =>
  !keySchema ||
  CLOUDFLARE_SECRETS_STORE_SECRET_NAME_PATTERN.test(keySchema.replace(/\{\{secretKey\}\}|\{\{environment\}\}/g, "A"));

const hasCloudflareSecretsStoreCompatibleKeySchema = (val: { syncOptions?: { keySchema?: string } }) =>
  isCloudflareSecretsStoreCompatibleKeySchema(val.syncOptions?.keySchema);

const CLOUDFLARE_SECRETS_STORE_KEY_SCHEMA_ERROR = {
  message: `Key schema produces names Cloudflare Secrets Store rejects. ${CLOUDFLARE_SECRETS_STORE_SECRET_NAME_RULE}`,
  path: ["syncOptions", "keySchema"]
};

const storeIdCharacterValidator = characterValidator([
  CharacterType.AlphaNumeric,
  CharacterType.Underscore,
  CharacterType.Hyphen
]);

const CloudflareSecretsStoreSyncDestinationConfigSchema = z.object({
  storeId: z
    .string()
    .trim()
    .min(1, "Store ID is required")
    .max(32, "Store ID cannot exceed 32 characters")
    .refine(
      (val) => storeIdCharacterValidator(val),
      "Store ID can only contain alphanumeric characters, underscores, and hyphens"
    )
    .describe(SecretSyncs.DESTINATION_CONFIG.CLOUDFLARE_SECRETS_STORE.storeId),
  storeName: z
    .string()
    .trim()
    .max(255)
    .optional()
    .describe(SecretSyncs.DESTINATION_CONFIG.CLOUDFLARE_SECRETS_STORE.storeName),
  scopes: z
    .nativeEnum(CloudflareSecretsStoreScope)
    .array()
    .min(1, "At least one scope is required")
    .refine((scopes) => new Set(scopes).size === scopes.length, "Each scope can only be listed once")
    .describe(SecretSyncs.DESTINATION_CONFIG.CLOUDFLARE_SECRETS_STORE.scopes)
});

const CloudflareSecretsStoreSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const CloudflareSecretsStoreSyncSchema = BaseSecretSyncSchema(
  SecretSync.CloudflareSecretsStore,
  CloudflareSecretsStoreSyncOptionsConfig
)
  .extend({
    destination: z.literal(SecretSync.CloudflareSecretsStore),
    destinationConfig: CloudflareSecretsStoreSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.CloudflareSecretsStore] }));

export const CreateCloudflareSecretsStoreSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.CloudflareSecretsStore,
  CloudflareSecretsStoreSyncOptionsConfig
)
  .extend({
    destinationConfig: CloudflareSecretsStoreSyncDestinationConfigSchema
  })
  .refine(hasCloudflareSecretsStoreCompatibleKeySchema, CLOUDFLARE_SECRETS_STORE_KEY_SCHEMA_ERROR);

export const UpdateCloudflareSecretsStoreSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.CloudflareSecretsStore,
  CloudflareSecretsStoreSyncOptionsConfig
)
  .extend({
    destinationConfig: CloudflareSecretsStoreSyncDestinationConfigSchema.optional()
  })
  .refine(hasCloudflareSecretsStoreCompatibleKeySchema, CLOUDFLARE_SECRETS_STORE_KEY_SCHEMA_ERROR);

export const CloudflareSecretsStoreSyncListItemSchema = z
  .object({
    name: z.literal("Cloudflare Secrets Store"),
    connection: z.literal(AppConnection.Cloudflare),
    destination: z.literal(SecretSync.CloudflareSecretsStore),
    canImportSecrets: z.literal(false),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.CloudflareSecretsStore] }));
