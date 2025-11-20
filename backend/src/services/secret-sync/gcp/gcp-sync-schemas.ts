import z from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SecretSync } from "../secret-sync-enums";
import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { GCPSecretManagerLocation, GcpSyncScope } from "./gcp-sync-enums";

const GcpSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

const GcpSyncDestinationConfigSchema = z.discriminatedUnion("scope", [
  z
    .object({
      scope: z.literal(GcpSyncScope.Global).describe(SecretSyncs.DESTINATION_CONFIG.GCP.scope),
      projectId: z.string().min(1, "Project ID is required").describe(SecretSyncs.DESTINATION_CONFIG.GCP.projectId)
    })
    .describe(
      JSON.stringify({
        title: "Global"
      })
    ),
  z
    .object({
      scope: z.literal(GcpSyncScope.Region).describe(SecretSyncs.DESTINATION_CONFIG.GCP.scope),
      projectId: z.string().min(1, "Project ID is required").describe(SecretSyncs.DESTINATION_CONFIG.GCP.projectId),
      locationId: z.nativeEnum(GCPSecretManagerLocation).describe(SecretSyncs.DESTINATION_CONFIG.GCP.locationId)
    })
    .describe(
      JSON.stringify({
        title: "Region"
      })
    )
]);

export const GcpSyncSchema = BaseSecretSyncSchema(SecretSync.GCPSecretManager, GcpSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.GCPSecretManager),
    destinationConfig: GcpSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.GCPSecretManager] }));

export const CreateGcpSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.GCPSecretManager,
  GcpSyncOptionsConfig
).extend({
  destinationConfig: GcpSyncDestinationConfigSchema
});

export const UpdateGcpSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.GCPSecretManager,
  GcpSyncOptionsConfig
).extend({
  destinationConfig: GcpSyncDestinationConfigSchema.optional()
});

export const GcpSyncListItemSchema = z
  .object({
    name: z.literal("GCP Secret Manager"),
    connection: z.literal(AppConnection.GCP),
    destination: z.literal(SecretSync.GCPSecretManager),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.GCPSecretManager] }));
