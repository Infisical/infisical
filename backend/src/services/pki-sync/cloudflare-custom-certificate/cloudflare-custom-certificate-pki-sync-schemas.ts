import RE2 from "re2";
import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import { PkiSyncSchema } from "@app/services/pki-sync/pki-sync-schemas";

import { CLOUDFLARE_CUSTOM_CERTIFICATE_NAMING } from "./cloudflare-custom-certificate-pki-sync-constants";

export const CloudflareCustomCertificatePkiSyncConfigSchema = z.object({
  zoneId: z.string().min(1, "Zone ID is required")
});

// API-facing schema - only exposes user-configurable options
export const CloudflareCustomCertificatePkiSyncOptionsSchema = z.object({
  canRemoveCertificates: z.boolean().default(true),
  certificateNameSchema: z
    .string()
    .optional()
    .refine(
      (schema) => {
        if (!schema) return true;

        const testName = schema
          .replace(new RE2("\\{\\{certificateId\\}\\}", "g"), "")
          .replace(new RE2("\\{\\{environment\\}\\}", "g"), "");

        const hasForbiddenChars = CLOUDFLARE_CUSTOM_CERTIFICATE_NAMING.FORBIDDEN_CHARACTERS.split("").some((char) =>
          testName.includes(char)
        );

        return CLOUDFLARE_CUSTOM_CERTIFICATE_NAMING.NAME_PATTERN.test(testName) && !hasForbiddenChars;
      },
      {
        message:
          "Certificate name schema must result in names that contain only alphanumeric characters, hyphens (-), and underscores (_) and be 1-255 characters long when compiled for Cloudflare"
      }
    )
});

export const CloudflareCustomCertificatePkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.CloudflareCustomCertificate),
  destinationConfig: CloudflareCustomCertificatePkiSyncConfigSchema,
  syncOptions: CloudflareCustomCertificatePkiSyncOptionsSchema
});

export const CreateCloudflareCustomCertificatePkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().default(true),
  destinationConfig: CloudflareCustomCertificatePkiSyncConfigSchema,
  syncOptions: CloudflareCustomCertificatePkiSyncOptionsSchema.optional().default({}),
  subscriberId: z.string().nullish(),
  connectionId: z.string(),
  projectId: z.string().trim().min(1),
  certificateIds: z.array(z.string().uuid()).optional()
});

export const UpdateCloudflareCustomCertificatePkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: CloudflareCustomCertificatePkiSyncConfigSchema.optional(),
  syncOptions: CloudflareCustomCertificatePkiSyncOptionsSchema.optional(),
  subscriberId: z.string().nullish(),
  connectionId: z.string().optional()
});

export const CloudflareCustomCertificatePkiSyncListItemSchema = z.object({
  name: z.literal("Cloudflare Custom SSL Certificate"),
  connection: z.literal(AppConnection.Cloudflare),
  destination: z.literal(PkiSync.CloudflareCustomCertificate),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(true)
});
