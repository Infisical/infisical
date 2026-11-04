import RE2 from "re2";
import { z } from "zod";

import { IMPERVA_PKI_SYNC_DESTINATION_CONFIG } from "@app/lib/api-docs";
import { openApiHidden } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { pkiDescriptionSchema } from "@app/services/certificate-common/certificate-constants";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import {
  BasePkiSyncOptionsSchema,
  PkiSyncFiltersField,
  PkiSyncSchema,
  UpdatePkiSyncFiltersField
} from "@app/services/pki-sync/pki-sync-schemas";

const SITE_ID_PATTERN = new RE2("^[0-9]+$");

export const ImpervaPkiSyncConfigSchema = z.object({
  siteId: z
    .string()
    .trim()
    .min(1, "Site ID is required")
    .max(20, "Site ID cannot exceed 20 characters")
    .refine((val) => SITE_ID_PATTERN.test(val), {
      message: "Site ID must be the numeric Imperva website ID"
    })
    .describe(IMPERVA_PKI_SYNC_DESTINATION_CONFIG.siteId),
  siteName: z
    .string()
    .trim()
    .max(512, "Site name cannot exceed 512 characters")
    .optional()
    .describe(IMPERVA_PKI_SYNC_DESTINATION_CONFIG.siteName)
});

export const ImpervaPkiSyncOptionsSchema = BasePkiSyncOptionsSchema.pick({
  canRemoveCertificates: true,
  includeRootCa: true
});

export const ImpervaPkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.Imperva),
  destinationConfig: ImpervaPkiSyncConfigSchema,
  syncOptions: ImpervaPkiSyncOptionsSchema
});

export const CreateImpervaPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256),
  description: pkiDescriptionSchema.optional(),
  isAutoSyncEnabled: z.boolean().default(true),
  destinationConfig: ImpervaPkiSyncConfigSchema,
  syncOptions: ImpervaPkiSyncOptionsSchema,
  subscriberId: z.string().uuid().nullish(),
  connectionId: z.string().uuid(),
  projectId: z.string().trim().min(1).optional().describe(openApiHidden()),
  applicationId: z.string().uuid().optional(),
  certificateIds: z.array(z.string().uuid()).optional(),
  filters: PkiSyncFiltersField
});

export const UpdateImpervaPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  description: pkiDescriptionSchema.optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: ImpervaPkiSyncConfigSchema.optional(),
  syncOptions: ImpervaPkiSyncOptionsSchema.optional(),
  subscriberId: z.string().uuid().nullish(),
  connectionId: z.string().uuid().optional(),
  filters: UpdatePkiSyncFiltersField
});

export const ImpervaPkiSyncListItemSchema = z.object({
  name: z.literal("Imperva"),
  connection: z.literal(AppConnection.Imperva),
  destination: z.literal(PkiSync.Imperva),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(true)
});
