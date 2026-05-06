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

export const OvhSyncDestinationConfigSchema = z.object({
  path: z
    .string()
    .trim()
    .min(1, "Path required")
    .max(128)
    .transform((val) => new RE2("^/+|/+$", "g").replace(val, ""))
    .refine((val) => new RE2("^([a-zA-Z0-9._-]+/)*[a-zA-Z0-9._-]+$").test(val), {
      message:
        "Invalid OVH OKMS path format. Use alphanumerics, dots, dashes, underscores, and single slashes between segments."
    })
    .describe(SecretSyncs.DESTINATION_CONFIG.OVH.path)
});

const OvhSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const OvhSyncSchema = BaseSecretSyncSchema(SecretSync.OVH, OvhSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.OVH),
    destinationConfig: OvhSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.OVH] }));

export const CreateOvhSyncSchema = GenericCreateSecretSyncFieldsSchema(SecretSync.OVH, OvhSyncOptionsConfig).extend({
  destinationConfig: OvhSyncDestinationConfigSchema
});

export const UpdateOvhSyncSchema = GenericUpdateSecretSyncFieldsSchema(SecretSync.OVH, OvhSyncOptionsConfig).extend({
  destinationConfig: OvhSyncDestinationConfigSchema.optional()
});

export const OvhSyncListItemSchema = z
  .object({
    name: z.literal("OVH"),
    connection: z.literal(AppConnection.OVH),
    destination: z.literal(SecretSync.OVH),
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.OVH] }));
