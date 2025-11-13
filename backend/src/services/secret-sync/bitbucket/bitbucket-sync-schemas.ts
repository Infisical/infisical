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

const BitbucketSyncDestinationConfigSchema = z.object({
  repositorySlug: z.string().describe(SecretSyncs.DESTINATION_CONFIG.BITBUCKET.repositorySlug),
  environmentId: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.BITBUCKET.environmentId),
  workspaceSlug: z.string().describe(SecretSyncs.DESTINATION_CONFIG.BITBUCKET.workspaceSlug)
});

const BitbucketSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const BitbucketSyncSchema = BaseSecretSyncSchema(SecretSync.Bitbucket, BitbucketSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Bitbucket),
    destinationConfig: BitbucketSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Bitbucket] }));

export const CreateBitbucketSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Bitbucket,
  BitbucketSyncOptionsConfig
).extend({
  destinationConfig: BitbucketSyncDestinationConfigSchema
});

export const UpdateBitbucketSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Bitbucket,
  BitbucketSyncOptionsConfig
).extend({
  destinationConfig: BitbucketSyncDestinationConfigSchema.optional()
});

export const BitbucketSyncListItemSchema = z
  .object({
    name: z.literal("Bitbucket"),
    connection: z.literal(AppConnection.Bitbucket),
    destination: z.literal(SecretSync.Bitbucket),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Bitbucket] }));
