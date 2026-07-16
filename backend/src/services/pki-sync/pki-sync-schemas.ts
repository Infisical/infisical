import RE2 from "re2";
import { z } from "zod";

import { PkiSync } from "./pki-sync-enums";

// Schema for PKI sync options configuration
export const PkiSyncOptionsSchema = z.object({
  canImportCertificates: z.boolean(),
  canRemoveCertificates: z.boolean().optional(),
  includeRootCa: z.boolean().optional().default(false),
  certificateNameSchema: z
    .string()
    .trim()
    .min(1, "Certificate name schema is required")
    .refine(
      (val) => {
        const allowedPlaceholdersRegexPart = [
          "{{certificateId}}",
          "{{shortCertificateId}}",
          "{{profileId}}",
          "{{applicationId}}",
          "{{applicationName}}",
          "{{commonName}}"
        ]
          .map((p) => p.replace(new RE2(/[-/\\^$*+?.()|[\]{}]/g), "\\$&")) // Escape regex special characters
          .join("|");

        const allowedContentRegex = new RE2(`^([a-zA-Z0-9_\\-/]|${allowedPlaceholdersRegexPart})*$`);
        return allowedContentRegex.test(val);
      },
      {
        message:
          "Certificate name schema may include the {{certificateId}}, {{shortCertificateId}}, {{profileId}}, {{applicationId}}, {{applicationName}}, and {{commonName}} placeholders. Only alphanumeric characters (a-z, A-Z, 0-9), dashes (-), underscores (_), and slashes (/) are allowed besides the placeholders. A schema with no placeholder can be linked to only one certificate."
      }
    )
});

// Schema for destination-specific configurations
export const PkiSyncDestinationConfigSchema = z.object({
  destination: z.nativeEnum(PkiSync),
  config: z.record(z.unknown())
});

// Base PKI sync schema for API responses
export const PkiSyncSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(256),
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
