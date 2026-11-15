import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

const ImpervaSyncOptionsSchema = z.object({
  canRemoveCertificates: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  // hidden in the UI; Imperva holds one custom certificate per site, so certificates are not named
  certificateNameSchema: z.string().optional()
});

export const ImpervaPkiSyncDestinationSchema = BasePkiSyncSchema(ImpervaSyncOptionsSchema).merge(
  z.object({
    destination: z.literal(PkiSync.Imperva),
    destinationConfig: z.object({
      siteId: z
        .string()
        .trim()
        .min(1, "Website is required")
        .regex(/^[0-9]+$/, "Website ID must be the numeric Imperva website ID")
        .max(20, "Website ID cannot exceed 20 characters"),
      siteName: z.string().trim().max(512).optional()
    })
  })
);

export const UpdateImpervaPkiSyncDestinationSchema =
  ImpervaPkiSyncDestinationSchema.partial().merge(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(255, "Name must be less than 255 characters"),
      destination: z.literal(PkiSync.Imperva),
      connection: z.object({
        id: z.string().uuid("Invalid connection ID format"),
        name: z
          .string()
          .min(1, "Connection name is required")
          .max(255, "Connection name must be less than 255 characters")
      })
    })
  );
