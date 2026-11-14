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
import { CONVEX_KEY_SCHEMA_ERROR, hasConvexCompatibleKeySchema } from "./convex-sync-constants";

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
