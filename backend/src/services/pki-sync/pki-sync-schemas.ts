import { z } from "zod";

import { AzureKeyVaultPkiSyncConfigSchema } from "./azure-key-vault/azure-key-vault-pki-sync-types";
import { PkiSync } from "./pki-sync-enums";

// Schema for PKI sync options configuration
export const PkiSyncOptionsSchema = z.object({
  canImportCertificates: z.boolean()
});

// Schema for destination-specific configurations
export const PkiSyncDestinationConfigSchema = z.discriminatedUnion("destination", [
  z.object({
    destination: z.literal(PkiSync.AzureKeyVault),
    config: AzureKeyVaultPkiSyncConfigSchema
  })
]);

// Base PKI sync schema for API responses
export const PkiSyncSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(255),
  description: z.string().nullable().optional(),
  destination: z.nativeEnum(PkiSync),
  isAutoSyncEnabled: z.boolean(),
  destinationConfig: z.record(z.unknown()),
  syncOptions: z.record(z.unknown()),
  projectId: z.string().uuid(),
  subscriberId: z.string().uuid().nullable().optional(),
  connectionId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  syncStatus: z.string().nullable().optional(),
  lastSyncedAt: z.date().nullable().optional()
});

// Schema for PKI sync list items (includes app connection info)
export const PkiSyncListItemSchema = PkiSyncSchema.extend({
  appConnectionName: z.string().max(255),
  appConnectionApp: z.string().max(255)
});

// Schema for PKI sync details (includes app connection info)
export const PkiSyncDetailsSchema = PkiSyncSchema.extend({
  appConnectionName: z.string().max(255),
  appConnectionApp: z.string().max(255)
});

export type TPkiSyncSchema = z.infer<typeof PkiSyncSchema>;
export type TPkiSyncListItemSchema = z.infer<typeof PkiSyncListItemSchema>;
export type TPkiSyncDetailsSchema = z.infer<typeof PkiSyncDetailsSchema>;
