import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

export const PkiSyncFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(255, "Name must be less than 255 characters"),
  description: z.string().optional(),
  destination: z.nativeEnum(PkiSync),
  isAutoSyncEnabled: z.boolean().default(true),
  subscriberId: z.string().min(1, "PKI Subscriber is required"),
  connection: z.object({
    id: z.string().uuid("Invalid connection ID format"),
    name: z.string().max(255, "Connection name must be less than 255 characters")
  }),
  destinationConfig: z.object({
    vaultBaseUrl: z.string().url("Valid URL is required")
  }),
  syncOptions: z.object({
    canImportCertificates: z.boolean().default(false),
    canRemoveCertificates: z.boolean().default(false),
    certificateNameSchema: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;

          const allowedOptionalPlaceholders = ["{{environment}}"];

          const allowedPlaceholdersRegexPart = ["{{certificateId}}", ...allowedOptionalPlaceholders]
            .map((p) => p.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")) // Escape regex special characters
            .join("|");

          const allowedContentRegex = new RegExp(
            `^([a-zA-Z0-9_\\-/]|${allowedPlaceholdersRegexPart})*$`
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
            "Certificate name schema must include exactly one {{certificateId}} placeholder. It can also include {{environment}} placeholders. Only alphanumeric characters (a-z, A-Z, 0-9), dashes (-), underscores (_), and slashes (/) are allowed besides the placeholders."
        }
      )
  })
});

export type TPkiSyncForm = z.infer<typeof PkiSyncFormSchema>;

export const UpdatePkiSyncFormSchema = PkiSyncFormSchema.partial().merge(
  z.object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(255, "Name must be less than 255 characters"),
    destination: z.nativeEnum(PkiSync),
    connection: z.object({
      id: z.string().uuid("Invalid connection ID format"),
      name: z.string().max(255, "Connection name must be less than 255 characters")
    })
  })
);
