import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

const NutanixPrismCentralSyncOptionsSchema = z.object({
  canImportCertificates: z.literal(false).default(false),
  canRemoveCertificates: z.literal(false).default(false),
  // Nutanix has a single certificate slot per cluster, so destination-side
  // certificate names do not apply. The field is hidden in the UI and must
  // override the base schema's required certificateNameSchema.
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
