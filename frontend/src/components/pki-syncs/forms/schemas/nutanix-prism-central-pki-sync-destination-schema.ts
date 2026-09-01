import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

const NutanixPrismCentralSyncOptionsSchema = z.object({
  canImportCertificates: z.literal(false).default(false),
  canRemoveCertificates: z.literal(false).default(false),
  // hidden in the UI; overrides the base schema's required field
  certificateNameSchema: z.string().optional()
});

export const NutanixPrismCentralPkiSyncDestinationSchema = BasePkiSyncSchema(
  NutanixPrismCentralSyncOptionsSchema
).merge(
  z.object({
    destination: z.literal(PkiSync.NutanixPrismCentral),
    destinationConfig: z.object({
      clusterId: z.string().min(1, "Cluster is required"),
      clusterName: z.string().min(1, "Cluster is required")
    })
  })
);

export const UpdateNutanixPrismCentralPkiSyncDestinationSchema =
  NutanixPrismCentralPkiSyncDestinationSchema.partial().merge(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(255, "Name must be less than 255 characters"),
      destination: z.literal(PkiSync.NutanixPrismCentral),
      connection: z.object({
        id: z.string().uuid("Invalid connection ID format"),
        name: z
          .string()
          .min(1, "Connection name is required")
          .max(255, "Connection name must be less than 255 characters")
      })
    })
  );
