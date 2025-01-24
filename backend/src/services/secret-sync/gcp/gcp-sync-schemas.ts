import z from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SecretSync } from "../secret-sync-enums";

const GcpSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

const GcpSyncDestinationConfigSchema = z.object({
  projectId: z.string().min(1, "Project ID is required")
});

export const GcpSyncSchema = BaseSecretSyncSchema(SecretSync.GCP, GcpSyncOptionsConfig).extend({
  destination: z.literal(SecretSync.GCP),
  destinationConfig: GcpSyncDestinationConfigSchema
});

export const CreateGcpSyncSchema = GenericCreateSecretSyncFieldsSchema(SecretSync.GCP, GcpSyncOptionsConfig).extend({
  destinationConfig: GcpSyncDestinationConfigSchema
});

export const UpdateGcpSyncSchema = GenericUpdateSecretSyncFieldsSchema(SecretSync.GCP, GcpSyncOptionsConfig).extend({
  destinationConfig: GcpSyncDestinationConfigSchema.optional()
});

export const GcpSyncListItemSchema = z.object({
  name: z.literal("GCP"),
  connection: z.literal(AppConnection.GCP),
  destination: z.literal(SecretSync.GCP),
  canImportSecrets: z.literal(false)
});
