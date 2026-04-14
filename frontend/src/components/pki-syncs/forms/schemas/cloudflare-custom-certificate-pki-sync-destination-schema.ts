import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

// Only exposes user-configurable options
const CloudflareCustomCertificateSyncOptionsSchema = z.object({
  canRemoveCertificates: z.boolean().default(true),
  certificateNameSchema: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;

        const allowedOptionalPlaceholders = ["{{environment}}"];

        const allowedPlaceholdersRegexPart = ["{{certificateId}}", ...allowedOptionalPlaceholders]
          .map((p) => p.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
          .join("|");

        const allowedContentRegex = new RegExp(
          `^([a-zA-Z0-9_\\-]|${allowedPlaceholdersRegexPart})*$`
        );
        const contentIsValid = allowedContentRegex.test(val);

        if (val.trim()) {
          const certificateIdRegex = /\{\{certificateId\}\}/;
          const certificateIdIsPresent = certificateIdRegex.test(val);
          return contentIsValid && certificateIdIsPresent;
        }

        return contentIsValid;
      },
      {
        message:
          "Certificate name schema must include exactly one {{certificateId}} placeholder. It can also include {{environment}} placeholders. Only alphanumeric characters (a-z, A-Z, 0-9), dashes (-), and underscores (_) are allowed besides the placeholders."
      }
    )
});

export const CloudflareCustomCertificatePkiSyncDestinationSchema = BasePkiSyncSchema(
  CloudflareCustomCertificateSyncOptionsSchema
).merge(
  z.object({
    destination: z.literal(PkiSync.CloudflareCustomCertificate),
    destinationConfig: z.object({
      zoneId: z.string().min(1, "Zone ID is required")
    })
  })
);

export const UpdateCloudflareCustomCertificatePkiSyncDestinationSchema =
  CloudflareCustomCertificatePkiSyncDestinationSchema.partial().merge(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(255, "Name must be less than 255 characters"),
      destination: z.literal(PkiSync.CloudflareCustomCertificate),
      connection: z.object({
        id: z.string().uuid("Invalid connection ID format"),
        name: z
          .string()
          .min(1, "Connection name is required")
          .max(255, "Connection name must be less than 255 characters")
      })
    })
  );
