import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

const SupabaseSyncDestinationConfigSchema = z.object({
  projectId: z.string().max(255).min(1, "Project ID is required"),
  projectName: z.string().max(255).min(1, "Project Name is required")
});

const SupabaseSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const SupabaseSyncSchema = BaseSecretSyncSchema(SecretSync.Supabase, SupabaseSyncOptionsConfig).extend({
  destination: z.literal(SecretSync.Supabase),
  destinationConfig: SupabaseSyncDestinationConfigSchema
});

export const CreateSupabaseSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Supabase,
  SupabaseSyncOptionsConfig
).extend({
  destinationConfig: SupabaseSyncDestinationConfigSchema
});

export const UpdateSupabaseSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Supabase,
  SupabaseSyncOptionsConfig
).extend({
  destinationConfig: SupabaseSyncDestinationConfigSchema.optional()
});

export const SupabaseSyncListItemSchema = z.object({
  name: z.literal("Supabase"),
  connection: z.literal(AppConnection.Supabase),
  destination: z.literal(SecretSync.Supabase),
  canImportSecrets: z.literal(false)
});
