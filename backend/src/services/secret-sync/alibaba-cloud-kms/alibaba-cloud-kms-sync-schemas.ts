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

const AlibabaCloudKMSSyncDestinationConfigSchema = z.object({
  secretPrefix: z
    .string()
    .trim()
    .max(128, "Secret prefix cannot exceed 128 characters")
    .optional()
    .describe(SecretSyncs.DESTINATION_CONFIG.ALIBABA_CLOUD_KMS.secretPrefix)
});

const AlibabaCloudKMSSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const AlibabaCloudKMSSyncSchema = BaseSecretSyncSchema(
  SecretSync.AlibabaCloudKMS,
  AlibabaCloudKMSSyncOptionsConfig
)
  .extend({
    destination: z.literal(SecretSync.AlibabaCloudKMS),
    destinationConfig: AlibabaCloudKMSSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AlibabaCloudKMS] }));

export const CreateAlibabaCloudKMSSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.AlibabaCloudKMS,
  AlibabaCloudKMSSyncOptionsConfig
).extend({
  destinationConfig: AlibabaCloudKMSSyncDestinationConfigSchema
});

export const UpdateAlibabaCloudKMSSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.AlibabaCloudKMS,
  AlibabaCloudKMSSyncOptionsConfig
).extend({
  destinationConfig: AlibabaCloudKMSSyncDestinationConfigSchema.optional()
});

export const AlibabaCloudKMSSyncListItemSchema = z
  .object({
    name: z.literal("Alibaba Cloud KMS"),
    connection: z.literal(AppConnection.AlibabaCloud),
    destination: z.literal(SecretSync.AlibabaCloudKMS),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AlibabaCloudKMS] }));
