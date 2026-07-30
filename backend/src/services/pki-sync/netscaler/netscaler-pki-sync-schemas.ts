import { z } from "zod";

import { openApiHidden } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import {
  BasePkiSyncOptionsSchema,
  buildDestinationCertificateNameSchema,
  PkiSyncSchema
} from "@app/services/pki-sync/pki-sync-schemas";

import { NETSCALER_NAMING } from "./netscaler-pki-sync-constants";

export const NetScalerPkiSyncConfigSchema = z.object({
  vserverName: z.string().max(127, "vServer name cannot exceed 127 characters").optional()
});

export const NetScalerPkiSyncOptionsSchema = BasePkiSyncOptionsSchema.extend({
  certificateNameSchema: buildDestinationCertificateNameSchema({
    naming: NETSCALER_NAMING,
    message:
      "Certificate name schema must result in names that contain only alphanumeric characters, hyphens (-), underscores (_), and periods (.) and be 1-63 characters long for NetScaler. Available placeholders: {{certificateId}}, {{shortCertificateId}}, {{profileId}}, {{applicationId}}, {{applicationName}}, {{commonName}}. A schema with no placeholder can be linked to only one certificate."
  })
});

export const NetScalerPkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.NetScaler),
  destinationConfig: NetScalerPkiSyncConfigSchema,
  syncOptions: NetScalerPkiSyncOptionsSchema
});

export const CreateNetScalerPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().default(true),
  destinationConfig: NetScalerPkiSyncConfigSchema,
  syncOptions: NetScalerPkiSyncOptionsSchema,
  subscriberId: z.string().nullish(),
  connectionId: z.string(),
  projectId: z.string().trim().min(1).optional().describe(openApiHidden()),
  applicationId: z.string().uuid().optional(),
  certificateIds: z.array(z.string().uuid()).optional()
});

export const UpdateNetScalerPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: NetScalerPkiSyncConfigSchema.optional(),
  syncOptions: NetScalerPkiSyncOptionsSchema.optional(),
  subscriberId: z.string().nullish(),
  connectionId: z.string().optional()
});

export const NetScalerPkiSyncListItemSchema = z.object({
  name: z.literal("NetScaler"),
  connection: z.literal(AppConnection.NetScaler),
  destination: z.literal(PkiSync.NetScaler),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(true)
});
