import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

const ChefFieldMappingsSchema = z.object({
  certificate: z.string().min(1, "Certificate field name is required").default("certificate"),
  privateKey: z.string().min(1, "Private key field name is required").default("private_key"),
  certificateChain: z
    .string()
    .min(1, "Certificate chain field name is required")
    .default("certificate_chain"),
  caCertificate: z
    .string()
    .min(1, "CA certificate field name is required")
    .default("ca_certificate")
});

const ChefSyncOptionsSchema = z.object({
  canImportCertificates: z.boolean().default(false),
  canRemoveCertificates: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  preserveItemOnRenewal: z.boolean().default(true),
  updateExistingCertificates: z.boolean().default(true),
  certificateNameSchema: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;

        const allowedOptionalPlaceholders = [
          "{{environment}}",
          "{{profileId}}",
          "{{commonName}}",
          "{{friendlyName}}"
        ];

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
          "Certificate item name schema must include exactly one {{certificateId}} placeholder. It can also include {{environment}}, {{profileId}}, {{commonName}}, or {{friendlyName}} placeholders. Only alphanumeric characters (a-z, A-Z, 0-9), hyphens (-), and underscores (_) are allowed besides the placeholders."
      }
    ),
  fieldMappings: ChefFieldMappingsSchema.optional().default({
    certificate: "certificate",
    privateKey: "private_key",
    certificateChain: "certificate_chain",
    caCertificate: "ca_certificate"
  })
});

export const ChefPkiSyncDestinationSchema = BasePkiSyncSchema(ChefSyncOptionsSchema).merge(
  z.object({
    destination: z.literal(PkiSync.Chef),
    destinationConfig: z.object({
      dataBagName: z
        .string()
        .min(1, "Data bag name is required")
        .max(255, "Data bag name must be less than 255 characters")
        .regex(
          /^[a-zA-Z0-9_-]+$/,
          "Data bag name can only contain alphanumeric characters, underscores, and hyphens"
        )
    })
  })
);

export const UpdateChefPkiSyncDestinationSchema = ChefPkiSyncDestinationSchema.partial().merge(
  z.object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(255, "Name must be less than 255 characters"),
    destination: z.literal(PkiSync.Chef),
    connection: z.object({
      id: z.string().uuid("Invalid connection ID format"),
      name: z
        .string()
        .min(1, "Connection name is required")
        .max(255, "Connection name must be less than 255 characters")
    })
  })
);
