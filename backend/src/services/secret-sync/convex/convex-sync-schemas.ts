import RE2 from "re2";
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

const CONVEX_ENV_VAR_NAME_PATTERN = new RE2(/^[A-Za-z_][A-Za-z0-9_]{0,255}$/);
// Set by Convex on every deployment, and refused if written
const CONVEX_BUILT_IN_ENV_VARS = ["CONVEX_CLOUD_URL", "CONVEX_SITE_URL"];

export const CONVEX_ENV_VAR_NAME_RULE = `Convex environment variable names must start with a letter or underscore, contain only letters, digits and underscores, be at most 256 characters, and not be ${CONVEX_BUILT_IN_ENV_VARS.join(" or ")}.`;

export const isValidConvexEnvVarName = (name: string) =>
  CONVEX_ENV_VAR_NAME_PATTERN.test(name) && !CONVEX_BUILT_IN_ENV_VARS.includes(name);

// A key schema is applied to every synced key, so literal characters Convex rejects would produce a sync that
// saves cleanly and then fails on every run. Placeholders are substituted with a valid token so only the schema's
// literals are under test; the resolved names are checked again at sync time.
const hasConvexCompatibleKeySchema = ({ syncOptions }: { syncOptions?: { keySchema?: string } }) =>
  !syncOptions?.keySchema ||
  CONVEX_ENV_VAR_NAME_PATTERN.test(syncOptions.keySchema.replace(/\{\{secretKey\}\}|\{\{environment\}\}/g, "A"));

const CONVEX_KEY_SCHEMA_ERROR = {
  message: `Key schema produces names Convex rejects. ${CONVEX_ENV_VAR_NAME_RULE}`,
  path: ["syncOptions", "keySchema"]
};

const ConvexSyncDestinationConfigSchema = z.object({
  deploymentName: z
    .string()
    .trim()
    .min(1, "Deployment required")
    .max(128)
    .regex(new RE2(/^[a-z0-9-]+$/), "Deployment name can only contain lowercase letters, numbers and hyphens")
    .describe(SecretSyncs.DESTINATION_CONFIG.CONVEX.deploymentName)
});

const ConvexSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const ConvexSyncSchema = BaseSecretSyncSchema(SecretSync.Convex, ConvexSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Convex),
    destinationConfig: ConvexSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Convex] }));

export const CreateConvexSyncSchema = GenericCreateSecretSyncFieldsSchema(SecretSync.Convex, ConvexSyncOptionsConfig)
  .extend({
    destinationConfig: ConvexSyncDestinationConfigSchema
  })
  .refine(hasConvexCompatibleKeySchema, CONVEX_KEY_SCHEMA_ERROR);

export const UpdateConvexSyncSchema = GenericUpdateSecretSyncFieldsSchema(SecretSync.Convex, ConvexSyncOptionsConfig)
  .extend({
    destinationConfig: ConvexSyncDestinationConfigSchema.optional()
  })
  .refine(hasConvexCompatibleKeySchema, CONVEX_KEY_SCHEMA_ERROR);

export const ConvexSyncListItemSchema = z
  .object({
    name: z.literal("Convex"),
    connection: z.literal(AppConnection.Convex),
    destination: z.literal(SecretSync.Convex),
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Convex] }));
