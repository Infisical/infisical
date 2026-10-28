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
import { DenoDeploySyncContext } from "./deno-deploy-sync-enums";

const DenoDeploySyncDestinationConfigSchema = z.object({
  appId: z.string().trim().min(1, "App required").max(255).describe(SecretSyncs.DESTINATION_CONFIG.DENO_DEPLOY.appId),
  appSlug: z
    .string()
    .trim()
    .min(1, "App slug required")
    .max(32)
    .describe(SecretSyncs.DESTINATION_CONFIG.DENO_DEPLOY.appSlug),
  context: z
    .nativeEnum(DenoDeploySyncContext)
    .default(DenoDeploySyncContext.Production)
    .describe(SecretSyncs.DESTINATION_CONFIG.DENO_DEPLOY.context)
});

const DenoDeploySyncOptionsConfig: TSyncOptionsConfig = {
  canImportSecrets: true,
  canRemoveSecretsOnDeletion: true
};

export const DenoDeploySyncSchema = BaseSecretSyncSchema(SecretSync.DenoDeploy, DenoDeploySyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.DenoDeploy),
    destinationConfig: DenoDeploySyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.DenoDeploy] }));

export const CreateDenoDeploySyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.DenoDeploy,
  DenoDeploySyncOptionsConfig
).extend({
  destinationConfig: DenoDeploySyncDestinationConfigSchema
});

export const UpdateDenoDeploySyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.DenoDeploy,
  DenoDeploySyncOptionsConfig
).extend({
  destinationConfig: DenoDeploySyncDestinationConfigSchema.optional()
});

export const DenoDeploySyncListItemSchema = z
  .object({
    name: z.literal("Deno Deploy"),
    connection: z.literal(AppConnection.DenoDeploy),
    destination: z.literal(SecretSync.DenoDeploy),
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.DenoDeploy] }));
