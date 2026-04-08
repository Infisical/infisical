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

        const allowedOptionalPlaceholders = ["{{environment}}"];

        const allowedPlaceholdersRegexPart = ["{{certificateId}}", ...allowedOptionalPlaceholders]
          .map((p) => p.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
          .join("|");

        const allowedContentRegex = new RegExp(
          `^([a-zA-Z0-9_\\-.]|${allowedPlaceholdersRegexPart})*$`
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
          "Certificate name schema must include exactly one {{certificateId}} placeholder. It can also include {{environment}} placeholders. Only alphanumeric characters (a-z, A-Z, 0-9), dashes (-), underscores (_), and periods (.) are allowed besides the placeholders."
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
