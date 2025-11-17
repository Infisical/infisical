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

const CloudflareWorkersSyncDestinationConfigSchema = z.object({
  scriptId: z
    .string()
    .min(1, "Script ID is required")
    .max(64)
    .refine((val) => {
      const re2 = new RE2(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
      return re2.test(val);
    }, "Invalid script ID format")
    .describe(SecretSyncs.DESTINATION_CONFIG.CLOUDFLARE_WORKERS.scriptId)
});

const CloudflareWorkersSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const CloudflareWorkersSyncSchema = BaseSecretSyncSchema(
  SecretSync.CloudflareWorkers,
  CloudflareWorkersSyncOptionsConfig
)
  .extend({
    destination: z.literal(SecretSync.CloudflareWorkers),
    destinationConfig: CloudflareWorkersSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.CloudflareWorkers] }));

export const CreateCloudflareWorkersSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.CloudflareWorkers,
  CloudflareWorkersSyncOptionsConfig
).extend({
  destinationConfig: CloudflareWorkersSyncDestinationConfigSchema
});

export const UpdateCloudflareWorkersSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.CloudflareWorkers,
  CloudflareWorkersSyncOptionsConfig
).extend({
  destinationConfig: CloudflareWorkersSyncDestinationConfigSchema.optional()
});

export const CloudflareWorkersSyncListItemSchema = z
  .object({
    name: z.literal("Cloudflare Workers"),
    connection: z.literal(AppConnection.Cloudflare),
    destination: z.literal(SecretSync.CloudflareWorkers),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.CloudflareWorkers] }));
