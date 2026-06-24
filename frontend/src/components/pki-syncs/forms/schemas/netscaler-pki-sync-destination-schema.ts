import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

const NetScalerSyncOptionsSchema = z.object({
  canRemoveCertificates: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  preserveItemOnRenewal: z.boolean().default(true),
  certificateNameSchema: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;

        const allowedOptionalPlaceholders = [
          "{{profileId}}",
          "{{applicationId}}",
          "{{commonName}}"
        ];

        const allowedPlaceholdersRegexPart = ["{{certificateId}}", ...allowedOptionalPlaceholders]
          .map((p) => p.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
          .join("|");

        const allowedContentRegex = new RegExp(
          `^([a-zA-Z0-9_\\-.]|${allowedPlaceholdersRegexPart})*$`
        );
        const contentIsValid = allowedContentRegex.test(val);

        // NetScaler caps certkey names at 63 chars. UUID placeholders resolve to 32 chars each,
        // so check the realistic compiled length to reject over-limit schemas before sync time.
        const compiledLength = val
          .replace(/\{\{certificateId\}\}/g, "0".repeat(32))
          .replace(/\{\{profileId\}\}/g, "0".repeat(32))
          .replace(/\{\{applicationId\}\}/g, "0".repeat(32))
          .replace(/\{\{commonName\}\}/g, "common-name").length;
        const lengthIsValid = compiledLength <= 63;

        if (val.trim()) {
          const certificateIdRegex = /\{\{certificateId\}\}/;
          const certificateIdIsPresent = certificateIdRegex.test(val);
          return contentIsValid && certificateIdIsPresent && lengthIsValid;
        }

        return contentIsValid;
      },
      {
        message:
          "Certificate name schema must include the {{certificateId}} placeholder and compile to at most 63 characters for NetScaler (each UUID placeholder counts as 32 characters). It can also include {{profileId}}, {{applicationId}}, and {{commonName}} placeholders. Only alphanumeric characters (a-z, A-Z, 0-9), dashes (-), underscores (_), and periods (.) are allowed besides the placeholders."
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
