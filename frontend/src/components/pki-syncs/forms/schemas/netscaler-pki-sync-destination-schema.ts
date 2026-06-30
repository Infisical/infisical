import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

const NetScalerSyncOptionsSchema = z.object({
  canRemoveCertificates: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  preserveItemOnRenewal: z.boolean().default(true),
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

        // NetScaler caps certkey names at 63 chars. Full UUID placeholders resolve to 32 chars and
        // {{shortCertificateId}} to 22
        const compiledLength = val
          .replace(/\{\{shortCertificateId\}\}/g, "0".repeat(22))
          .replace(/\{\{certificateId\}\}/g, "0".repeat(32))
          .replace(/\{\{profileId\}\}/g, "0".repeat(32))
          .replace(/\{\{applicationId\}\}/g, "0".repeat(32))
          .replace(/\{\{applicationName\}\}/g, "application-name")
          .replace(/\{\{commonName\}\}/g, "common-name").length;
        const lengthIsValid = compiledLength <= 63;

        const certificateIdIsPresent =
          val.includes("{{certificateId}}") || val.includes("{{shortCertificateId}}");
        return contentIsValid && certificateIdIsPresent && lengthIsValid;
      },
      {
        message:
          "Certificate name schema must include the {{certificateId}} or {{shortCertificateId}} placeholder and compile to at most 63 characters for NetScaler ({{certificateId}}, {{profileId}}, and {{applicationId}} count as 32 characters each; {{shortCertificateId}} counts as 22). It can also include {{profileId}}, {{applicationId}}, {{applicationName}}, and {{commonName}} placeholders. Only alphanumeric characters (a-z, A-Z, 0-9), dashes (-), underscores (_), and periods (.) are allowed besides the placeholders."
      }
    )
});

export const NetScalerPkiSyncDestinationSchema = BasePkiSyncSchema(
  NetScalerSyncOptionsSchema
).merge(
  z.object({
    destination: z.literal(PkiSync.NetScaler),
    destinationConfig: z.object({
      vserverName: z.string().max(127, "vServer name cannot exceed 127 characters").optional()
    })
  })
);

export const UpdateNetScalerPkiSyncDestinationSchema =
  NetScalerPkiSyncDestinationSchema.partial().merge(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(255, "Name must be less than 255 characters"),
      destination: z.literal(PkiSync.NetScaler),
      connection: z.object({
        id: z.string().uuid("Invalid connection ID format"),
        name: z
          .string()
          .min(1, "Connection name is required")
          .max(255, "Connection name must be less than 255 characters")
      })
    })
  );
