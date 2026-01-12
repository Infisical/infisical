import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const ConvexSyncDestinationConfigSchema = z.object({
  deploymentUrl: z
    .string()
    .trim()
    .min(1, "Deployment URL is required")
    .max(255, "Deployment URL must be less than 255 characters")
    .url("Deployment URL must be a valid URL")
    .transform(removeTrailingSlash)
    .describe(SecretSyncs.DESTINATION_CONFIG.CONVEX.deploymentUrl)
});

const ConvexSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const ConvexSyncSchema = BaseSecretSyncSchema(SecretSync.Convex, ConvexSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Convex),
    destinationConfig: ConvexSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Convex] }));

export const CreateConvexSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Convex,
  ConvexSyncOptionsConfig
).extend({
  destinationConfig: ConvexSyncDestinationConfigSchema
});

export const UpdateConvexSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Convex,
  ConvexSyncOptionsConfig
).extend({
  destinationConfig: ConvexSyncDestinationConfigSchema.optional()
});

export const ConvexSyncListItemSchema = z
  .object({
    name: z.literal("Convex"),
    connection: z.literal(AppConnection.Convex),
    destination: z.literal(SecretSync.Convex),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Convex] }));
