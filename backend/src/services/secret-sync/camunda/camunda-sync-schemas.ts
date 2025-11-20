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

const CamundaSyncDestinationConfigSchema = z.object({
  scope: z.string().trim().min(1, "Camunda scope required").describe(SecretSyncs.DESTINATION_CONFIG.CAMUNDA.scope),
  clusterUUID: z
    .string()
    .min(1, "Camunda cluster UUID is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.CAMUNDA.clusterUUID)
});

const CamundaSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const CamundaSyncSchema = BaseSecretSyncSchema(SecretSync.Camunda, CamundaSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Camunda),
    destinationConfig: CamundaSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Camunda] }));

export const CreateCamundaSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Camunda,
  CamundaSyncOptionsConfig
).extend({
  destinationConfig: CamundaSyncDestinationConfigSchema
});

export const UpdateCamundaSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Camunda,
  CamundaSyncOptionsConfig
).extend({
  destinationConfig: CamundaSyncDestinationConfigSchema.optional()
});

export const CamundaSyncListItemSchema = z
  .object({
    name: z.literal("Camunda"),
    connection: z.literal(AppConnection.Camunda),
    destination: z.literal(SecretSync.Camunda),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Camunda] }));
