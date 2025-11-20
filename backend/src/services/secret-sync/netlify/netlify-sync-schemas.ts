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
import { NetlifySyncContext } from "./netlify-sync-constants";

const NetlifySyncDestinationConfigSchema = z.object({
  accountId: z
    .string()
    .min(1, "Account ID is required")
    .max(255, "Account ID must be less than 255 characters")
    .describe(SecretSyncs.DESTINATION_CONFIG.NETLIFY.accountId),
  accountName: z
    .string()
    .min(1, "Account Name is required")
    .max(255, "Account Name must be less than 255 characters")
    .optional()
    .describe(SecretSyncs.DESTINATION_CONFIG.NETLIFY.accountName),
  siteId: z
    .string()
    .min(1, "Site ID is required")
    .max(255, "Site ID must be less than 255 characters")
    .optional()
    .describe(SecretSyncs.DESTINATION_CONFIG.NETLIFY.siteId),
  siteName: z
    .string()
    .min(1, "Site Name is required")
    .max(255, "Site Name must be less than 255 characters")
    .optional()
    .describe(SecretSyncs.DESTINATION_CONFIG.NETLIFY.siteName),
  context: z.nativeEnum(NetlifySyncContext).optional().describe(SecretSyncs.DESTINATION_CONFIG.NETLIFY.context)
});

const NetlifySyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const NetlifySyncSchema = BaseSecretSyncSchema(SecretSync.Netlify, NetlifySyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Netlify),
    destinationConfig: NetlifySyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Netlify] }));

export const CreateNetlifySyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Netlify,
  NetlifySyncOptionsConfig
).extend({
  destinationConfig: NetlifySyncDestinationConfigSchema
});

export const UpdateNetlifySyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Netlify,
  NetlifySyncOptionsConfig
).extend({
  destinationConfig: NetlifySyncDestinationConfigSchema.optional()
});

export const NetlifySyncListItemSchema = z
  .object({
    name: z.literal("Netlify"),
    connection: z.literal(AppConnection.Netlify),
    destination: z.literal(SecretSync.Netlify),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Netlify] }));
