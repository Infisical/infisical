import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

const AwsCertificateManagerSyncOptionsSchema = z.object({
  canImportCertificates: z.boolean().default(false),
  canRemoveCertificates: z.boolean().default(false),
  includeRootCa: z.boolean().default(false),
  preserveArn: z.boolean().default(true),
  certificateNameSchema: z
    .string()
    .optional()
    .refine(
      (val) => {
        // For AWS Certificate Manager, {{certificateId}} is always required if certificateNameSchema is provided
        if (!val) return true;

        if (!val.includes("{{certificateId}}")) {
          return false;
        }

        const allowedOptionalPlaceholders = ["{{environment}}"];
        const allowedPlaceholdersRegexPart = ["{{certificateId}}", ...allowedOptionalPlaceholders]
          .map((p) => p.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
          .join("|");

        const allowedContentRegex = new RegExp(
          `^([a-zA-Z0-9_\\-/]|${allowedPlaceholdersRegexPart})*$`
        );

        return allowedContentRegex.test(val);
      },
      {
        message:
          "Certificate name schema must include {{certificateId}} placeholder for AWS Certificate Manager."
      }
    )
});

export const AwsCertificateManagerPkiSyncDestinationSchema = BasePkiSyncSchema(
  AwsCertificateManagerSyncOptionsSchema
).merge(
  z.object({
    destination: z.literal(PkiSync.AwsCertificateManager),
    destinationConfig: z.object({
      region: z.string().min(1, "AWS region is required")
    })
  })
);

export const UpdateAwsCertificateManagerPkiSyncDestinationSchema =
  AwsCertificateManagerPkiSyncDestinationSchema.partial().merge(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(255, "Name must be less than 255 characters"),
      destination: z.literal(PkiSync.AwsCertificateManager),
      connection: z.object({
        id: z.string().uuid("Invalid connection ID format"),
        name: z.string().max(255, "Connection name must be less than 255 characters")
      })
    })
  );
