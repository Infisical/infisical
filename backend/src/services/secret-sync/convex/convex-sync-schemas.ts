import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { normalizeConvexDeploymentUrl } from "@app/services/app-connection/convex/convex-url";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

export const ConvexSyncDestinationConfigSchema = z.object({
  deploymentUrl: z
    .string()
    .trim()
    .min(1, "Deployment required")
    .url("Invalid Convex deployment URL")
    .max(2048)
    .refine((url) => url.startsWith("https://"), "Deployment URL must use HTTPS")
    .transform((url) => normalizeConvexDeploymentUrl(url))
    .describe(SecretSyncs.DESTINATION_CONFIG.CONVEX.deploymentUrl),
  deploymentName: z
    .string()
    .trim()
    .min(1, "Deployment name required")
    .max(255)
    .describe(SecretSyncs.DESTINATION_CONFIG.CONVEX.deploymentName)
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
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Convex] }));
