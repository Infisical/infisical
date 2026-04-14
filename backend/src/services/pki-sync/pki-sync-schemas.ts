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
    .optional()
    .refine(
      (val) => {
        if (!val) return true;

        const allowedPlaceholdersRegexPart = ["{{certificateId}}"]
          .map((p) => p.replace(new RE2(/[-/\\^$*+?.()|[\]{}]/g), "\\$&")) // Escape regex special characters
          .join("|");

        const allowedContentRegex = new RE2(`^([a-zA-Z0-9_\\-/]|${allowedPlaceholdersRegexPart})*$`);
        const contentIsValid = allowedContentRegex.test(val);

        if (val.trim()) {
          const certificateIdRegex = new RE2(/\{\{certificateId\}\}/);
          const certificateIdIsPresent = certificateIdRegex.test(val);
          return contentIsValid && certificateIdIsPresent;
        }

        return contentIsValid;
      },
      {
        message:
          "Certificate name schema must include exactly one {{certificateId}} placeholder. Only alphanumeric characters (a-z, A-Z, 0-9), dashes (-), underscores (_), and slashes (/) are allowed besides the placeholders."
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
