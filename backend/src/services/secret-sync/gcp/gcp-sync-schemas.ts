import z from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SecretSync } from "../secret-sync-enums";
import { GcpSyncScope } from "./gcp-sync-enums";

const GcpSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

const GcpSyncDestinationConfigSchema = z.object({
  scope: z.literal(GcpSyncScope.Global),
  projectId: z.string().min(1, "Project ID is required")
});

export const GcpSyncSchema = BaseSecretSyncSchema(SecretSync.GCPSecretManager, GcpSyncOptionsConfig).extend({
  destination: z.literal(SecretSync.GCPSecretManager),
  destinationConfig: GcpSyncDestinationConfigSchema
});

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

export const GcpSyncListItemSchema = z.object({
  name: z.literal("GCP Secret Manager"),
  connection: z.literal(AppConnection.GCP),
  destination: z.literal(SecretSync.GCPSecretManager),
  canImportSecrets: z.literal(true)
});
