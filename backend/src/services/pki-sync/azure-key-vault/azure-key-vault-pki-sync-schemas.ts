import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import { PkiSyncSchema } from "@app/services/pki-sync/pki-sync-schemas";

import { AzureKeyVaultPkiSyncConfigSchema } from "./azure-key-vault-pki-sync-types";

export const AzureKeyVaultPkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.AzureKeyVault),
  destinationConfig: AzureKeyVaultPkiSyncConfigSchema
});

export const CreateAzureKeyVaultPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().default(true),
  destinationConfig: AzureKeyVaultPkiSyncConfigSchema,
  syncOptions: z.record(z.unknown()).optional().default({}),
  subscriberId: z.string().optional(),
  connectionId: z.string(),
  projectId: z.string().trim().min(1)
});

export const UpdateAzureKeyVaultPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: AzureKeyVaultPkiSyncConfigSchema.optional(),
  syncOptions: z.record(z.unknown()).optional(),
  subscriberId: z.string().optional(),
  connectionId: z.string().optional()
});

export const AzureKeyVaultPkiSyncListItemSchema = z.object({
  name: z.literal("Azure Key Vault"),
  connection: z.literal(AppConnection.AzureKeyVault),
  destination: z.literal(PkiSync.AzureKeyVault),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(true)
});
