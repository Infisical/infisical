import { z } from "zod";

import { openApiHidden } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import { PkiSyncSchema } from "@app/services/pki-sync/pki-sync-schemas";

export const NutanixPrismCentralPkiSyncConfigSchema = z.object({
  clusterId: z.string().min(1, "Cluster ID is required"),
  clusterName: z.string().min(1, "Cluster name is required")
});

export const NutanixPrismCentralPkiSyncOptionsSchema = z.object({
  canImportCertificates: z.literal(false).default(false),
  canRemoveCertificates: z.literal(false).default(false)
});

export const NutanixPrismCentralPkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.NutanixPrismCentral),
  destinationConfig: NutanixPrismCentralPkiSyncConfigSchema,
  syncOptions: NutanixPrismCentralPkiSyncOptionsSchema
});

export const CreateNutanixPrismCentralPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().default(true),
  destinationConfig: NutanixPrismCentralPkiSyncConfigSchema,
  syncOptions: NutanixPrismCentralPkiSyncOptionsSchema.optional().default({
    canImportCertificates: false,
    canRemoveCertificates: false
  }),
  subscriberId: z.string().nullish(),
  connectionId: z.string(),
  projectId: z.string().trim().min(1).optional().describe(openApiHidden()),
  applicationId: z.string().uuid().optional(),
  certificateIds: z.array(z.string().uuid()).optional()
});

export const UpdateNutanixPrismCentralPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: NutanixPrismCentralPkiSyncConfigSchema.optional(),
  syncOptions: NutanixPrismCentralPkiSyncOptionsSchema.optional(),
  subscriberId: z.string().nullish(),
  connectionId: z.string().optional()
});

export const NutanixPrismCentralPkiSyncListItemSchema = z.object({
  name: z.literal("Nutanix Prism Central"),
  connection: z.literal(AppConnection.NutanixPrismCentral),
  destination: z.literal(PkiSync.NutanixPrismCentral),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(false)
});
