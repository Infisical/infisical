import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

export const AzureKeyVaultPkiSyncDestinationSchema = BasePkiSyncSchema().merge(
  z.object({
    destination: z.literal(PkiSync.AzureKeyVault),
    destinationConfig: z.object({
      vaultBaseUrl: z.string().url("Valid URL is required")
    })
  })
);

export const UpdateAzureKeyVaultPkiSyncDestinationSchema =
  AzureKeyVaultPkiSyncDestinationSchema.partial().merge(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(255, "Name must be less than 255 characters"),
      destination: z.literal(PkiSync.AzureKeyVault),
      connection: z.object({
        id: z.string().uuid("Invalid connection ID format"),
        name: z.string().max(255, "Connection name must be less than 255 characters")
      })
    })
  );
