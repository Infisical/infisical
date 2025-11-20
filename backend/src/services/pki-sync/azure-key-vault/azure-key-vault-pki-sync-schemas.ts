import RE2 from "re2";
import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import { PkiSyncSchema } from "@app/services/pki-sync/pki-sync-schemas";

import { AZURE_KEY_VAULT_CERTIFICATE_NAMING } from "./azure-key-vault-pki-sync-constants";

export const AzureKeyVaultPkiSyncConfigSchema = z.object({
  vaultBaseUrl: z.string().url()
});

const AzureKeyVaultPkiSyncOptionsSchema = z.object({
  canImportCertificates: z.boolean().default(false),
  canRemoveCertificates: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  enableVersioning: z.boolean().default(true),
  certificateNameSchema: z
    .string()
    .optional()
    .refine(
      (schema) => {
        if (!schema) return true;

        const testName = schema
          .replace(new RE2("\\{\\{certificateId\\}\\}", "g"), "")
          .replace(new RE2("\\{\\{environment\\}\\}", "g"), "");

        const hasForbiddenChars = AZURE_KEY_VAULT_CERTIFICATE_NAMING.FORBIDDEN_CHARACTERS.split("").some((char) =>
          testName.includes(char)
        );

        return AZURE_KEY_VAULT_CERTIFICATE_NAMING.NAME_PATTERN.test(testName) && !hasForbiddenChars;
      },
      {
        message:
          "Certificate name schema must result in names that contain only alphanumeric characters and hyphens (a-z, A-Z, 0-9, -) and be 1-127 characters long when compiled for Azure Key Vault"
      }
    )
});

export const AzureKeyVaultPkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.AzureKeyVault),
  destinationConfig: AzureKeyVaultPkiSyncConfigSchema,
  syncOptions: AzureKeyVaultPkiSyncOptionsSchema
});

export const CreateAzureKeyVaultPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().default(true),
  destinationConfig: AzureKeyVaultPkiSyncConfigSchema,
  syncOptions: AzureKeyVaultPkiSyncOptionsSchema.optional().default({}),
  subscriberId: z.string().nullish(),
  connectionId: z.string(),
  projectId: z.string().trim().min(1),
  certificateIds: z.array(z.string().uuid()).optional()
});

export const UpdateAzureKeyVaultPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: AzureKeyVaultPkiSyncConfigSchema.optional(),
  syncOptions: AzureKeyVaultPkiSyncOptionsSchema.optional(),
  subscriberId: z.string().nullish(),
  connectionId: z.string().optional()
});

export const AzureKeyVaultPkiSyncListItemSchema = z.object({
  name: z.literal("Azure Key Vault"),
  connection: z.literal(AppConnection.AzureKeyVault),
  destination: z.literal(PkiSync.AzureKeyVault),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(false)
});
