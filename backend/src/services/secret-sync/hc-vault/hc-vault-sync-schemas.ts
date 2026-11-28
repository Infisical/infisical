import RE2 from "re2";
import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { hasHCVaultDotSegment } from "@app/services/app-connection/hc-vault/hc-vault-path-fns";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const HCVaultSyncDestinationConfigSchema = z.object({
  mount: z
    .string()
    .trim()
    .min(1, "Secrets Engine Mount required")
    .max(128)
    .describe(SecretSyncs.DESTINATION_CONFIG.HC_VAULT.mount),
  path: z
    .string()
    .trim()
    .min(1, "Path required")
    .max(128)
    .transform((val) => new RE2("^/+|/+$", "g").replace(val, "")) // removes leading/trailing slashes
    .refine((val) => new RE2("^([a-zA-Z0-9._-]+/)*[a-zA-Z0-9._-]+$").test(val), {
      message:
        "Invalid Vault path format. Use alphanumerics, dots, dashes, underscores, and single slashes between segments."
    })
    .describe(SecretSyncs.DESTINATION_CONFIG.HC_VAULT.path)
});

// Create and update only; stored configs are checked when the sync runs.
const HCVaultSyncDestinationConfigInputSchema = HCVaultSyncDestinationConfigSchema.superRefine((config, ctx) => {
  if (hasHCVaultDotSegment(config.mount)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Secrets Engine Mount cannot contain '.' or '..' segments.",
      path: ["mount"]
    });
  }

  if (hasHCVaultDotSegment(config.path)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Path cannot contain '.' or '..' segments.",
      path: ["path"]
    });
  }
});

const HCVaultSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const HCVaultSyncSchema = BaseSecretSyncSchema(SecretSync.HCVault, HCVaultSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.HCVault),
    destinationConfig: HCVaultSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.HCVault] }));

export const CreateHCVaultSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.HCVault,
  HCVaultSyncOptionsConfig
).extend({
  destinationConfig: HCVaultSyncDestinationConfigInputSchema
});

export const UpdateHCVaultSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.HCVault,
  HCVaultSyncOptionsConfig
).extend({
  destinationConfig: HCVaultSyncDestinationConfigInputSchema.optional()
});

export const HCVaultSyncListItemSchema = z
  .object({
    name: z.literal("Hashicorp Vault"),
    connection: z.literal(AppConnection.HCVault),
    destination: z.literal(SecretSync.HCVault),
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.HCVault] }));
