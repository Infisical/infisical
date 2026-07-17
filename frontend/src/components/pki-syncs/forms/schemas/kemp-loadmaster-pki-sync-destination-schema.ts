import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

export const KEMP_DEFAULT_CA_NAME_SCHEMA = "Infisical-ca-{{fingerprint}}";

const KempLoadMasterSyncOptionsSchema = z.object({
  canRemoveCertificates: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  preserveItemOnRenewal: z.boolean().default(true),
  syncCaCertificates: z.boolean().default(true),
  caCertificateNameSchema: z
    .string()
    .trim()
    .default(KEMP_DEFAULT_CA_NAME_SCHEMA)
    .refine(
      (val) => {
        const compiled = val
          .replace(/\{\{fingerprint\}\}/g, "0".repeat(24))
          .replace(/\{\{commonName\}\}/g, "common-name");
        return /^[a-zA-Z0-9_\-.]{1,251}$/.test(compiled);
      },
      {
        message:
          "CA certificate name schema must result in names 1-251 characters long containing only alphanumeric characters, hyphens (-), underscores (_), and periods (.). Available placeholders: {{fingerprint}} (recommended so each CA gets a unique name) and {{commonName}}. A schema with no placeholder can hold only one CA certificate. Defaults to Infisical-ca-{{fingerprint}}."
      }
    ),
  certificateNameSchema: z
    .string()
    .trim()
    .min(1, "Certificate name schema is required")
    .refine(
      (val) => {
        const allowedOptionalPlaceholders = [
          "{{profileId}}",
          "{{applicationId}}",
          "{{applicationName}}",
          "{{commonName}}"
        ];

        const allowedPlaceholdersRegexPart = [
          "{{certificateId}}",
          "{{shortCertificateId}}",
          ...allowedOptionalPlaceholders
        ]
          .map((p) => p.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
          .join("|");

        const allowedContentRegex = new RegExp(
          `^([a-zA-Z0-9_\\-.]|${allowedPlaceholdersRegexPart})*$`
        );
        const contentIsValid = allowedContentRegex.test(val);

        const compiledLength = val
          .replace(/\{\{shortCertificateId\}\}/g, "0".repeat(22))
          .replace(/\{\{certificateId\}\}/g, "0".repeat(32))
          .replace(/\{\{profileId\}\}/g, "0".repeat(32))
          .replace(/\{\{applicationId\}\}/g, "0".repeat(32))
          .replace(/\{\{applicationName\}\}/g, "application-name")
          .replace(/\{\{commonName\}\}/g, "common-name").length;
        const lengthIsValid = compiledLength <= 251;

        const certificateIdIsPresent =
          val.includes("{{certificateId}}") || val.includes("{{shortCertificateId}}");
        return contentIsValid && certificateIdIsPresent && lengthIsValid;
      },
      {
        message:
          "Certificate name schema must include the {{certificateId}} or {{shortCertificateId}} placeholder and compile to at most 251 characters for Kemp LoadMaster ({{certificateId}}, {{profileId}}, and {{applicationId}} count as 32 characters each; {{shortCertificateId}} counts as 22). It can also include {{profileId}}, {{applicationId}}, {{applicationName}}, and {{commonName}} placeholders. Only alphanumeric characters (a-z, A-Z, 0-9), hyphens (-), underscores (_), and periods (.) are allowed besides the placeholders."
      }
    )
});

export const KempLoadMasterPkiSyncDestinationSchema = BasePkiSyncSchema(
  KempLoadMasterSyncOptionsSchema
).merge(
  z.object({
    destination: z.literal(PkiSync.KempLoadMaster),
    destinationConfig: z.object({
      virtualServiceId: z
        .string()
        .trim()
        .regex(
          /^[0-9]+$/,
          "Virtual Service ID must be the numeric Virtual Service index shown on the LoadMaster"
        )
        .max(10, "Virtual Service ID cannot exceed 10 characters")
        .optional()
    })
  })
);

export const UpdateKempLoadMasterPkiSyncDestinationSchema =
  KempLoadMasterPkiSyncDestinationSchema.partial().merge(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(255, "Name must be less than 255 characters"),
      destination: z.literal(PkiSync.KempLoadMaster),
      connection: z.object({
        id: z.string().uuid("Invalid connection ID format"),
        name: z
          .string()
          .min(1, "Connection name is required")
          .max(255, "Connection name must be less than 255 characters")
      })
    })
  );
