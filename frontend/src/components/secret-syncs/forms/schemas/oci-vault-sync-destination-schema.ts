import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const OCIVaultSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.OCIVault),
    destinationConfig: z.object({
      compartmentOcid: z
        .string()
        .trim()
        .min(1, "Compartment OCID required")
        .regex(
          /^ocid1\.(tenancy|compartment)\.oc1\..+$/,
          "Invalid Compartment OCID format. Must start with ocid1.tenancy.oc1. or ocid1.compartment.oc1."
        ),
      vaultOcid: z
        .string()
        .trim()
        .min(1, "Vault OCID required")
        .regex(
          /^ocid1\.vault\.oc1\..+$/,
          "Invalid Vault OCID format. Must start with ocid1.vault.oc1."
        ),
      keyOcid: z
        .string()
        .trim()
        .min(1, "Key OCID required")
        .regex(/^ocid1\.key\.oc1\..+$/, "Invalid Key OCID format. Must start with ocid1.key.oc1.")
    })
  })
);
