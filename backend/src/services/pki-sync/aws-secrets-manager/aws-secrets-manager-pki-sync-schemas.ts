import RE2 from "re2";
import { z } from "zod";

import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import { PkiSyncSchema } from "@app/services/pki-sync/pki-sync-schemas";

import { AWS_SECRETS_MANAGER_PKI_SYNC_CERTIFICATE_NAMING } from "./aws-secrets-manager-pki-sync-constants";

export const AwsSecretsManagerPkiSyncConfigSchema = z.object({
  region: z.nativeEnum(AWSRegion),
  keyId: z.string().trim().optional()
});

export const AwsSecretsManagerFieldMappingsSchema = z.object({
  certificate: z.string().min(1, "Certificate field name is required").default("certificate"),
  privateKey: z.string().min(1, "Private key field name is required").default("private_key"),
  certificateChain: z.string().min(1, "Certificate chain field name is required").default("certificate_chain"),
  caCertificate: z.string().min(1, "CA certificate field name is required").default("ca_certificate")
});

const AwsSecretsManagerPkiSyncOptionsSchema = z.object({
  canImportCertificates: z.boolean().default(false),
  canRemoveCertificates: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  preserveSecretOnRenewal: z.boolean().default(true),
  updateExistingCertificates: z.boolean().default(true),
  certificateNameSchema: z
    .string()
    .optional()
    .refine(
      (schema) => {
        if (!schema) return true;

        if (!schema.includes("{{certificateId}}")) {
          return false;
        }

        const testName = schema
          .replace(new RE2("\\{\\{certificateId\\}\\}", "g"), "test-cert-id")
          .replace(new RE2("\\{\\{profileId\\}\\}", "g"), "test-profile-id")
          .replace(new RE2("\\{\\{commonName\\}\\}", "g"), "test-common-name")
          .replace(new RE2("\\{\\{friendlyName\\}\\}", "g"), "test-friendly-name")
          .replace(new RE2("\\{\\{environment\\}\\}", "g"), "test-env");

        const hasForbiddenChars = AWS_SECRETS_MANAGER_PKI_SYNC_CERTIFICATE_NAMING.FORBIDDEN_CHARACTERS.split("").some(
          (char) => testName.includes(char)
        );

        return (
          AWS_SECRETS_MANAGER_PKI_SYNC_CERTIFICATE_NAMING.NAME_PATTERN.test(testName) &&
          !hasForbiddenChars &&
          testName.length >= AWS_SECRETS_MANAGER_PKI_SYNC_CERTIFICATE_NAMING.MIN_LENGTH &&
          testName.length <= AWS_SECRETS_MANAGER_PKI_SYNC_CERTIFICATE_NAMING.MAX_LENGTH
        );
      },
      {
        message:
          "Certificate name schema must include {{certificateId}} placeholder and result in names that contain only alphanumeric characters, underscores, and hyphens and be 1-512 characters long for AWS Secrets Manager."
      }
    ),
  fieldMappings: AwsSecretsManagerFieldMappingsSchema.optional().default({
    certificate: "certificate",
    privateKey: "private_key",
    certificateChain: "certificate_chain",
    caCertificate: "ca_certificate"
  })
});

export const AwsSecretsManagerPkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.AwsSecretsManager),
  destinationConfig: AwsSecretsManagerPkiSyncConfigSchema,
  syncOptions: AwsSecretsManagerPkiSyncOptionsSchema
});

export const CreateAwsSecretsManagerPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().default(true),
  destinationConfig: AwsSecretsManagerPkiSyncConfigSchema,
  syncOptions: AwsSecretsManagerPkiSyncOptionsSchema.optional().default({}),
  subscriberId: z.string().nullish(),
  connectionId: z.string(),
  projectId: z.string().trim().min(1),
  certificateIds: z.array(z.string().uuid()).optional()
});

export const UpdateAwsSecretsManagerPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: AwsSecretsManagerPkiSyncConfigSchema.optional(),
  syncOptions: AwsSecretsManagerPkiSyncOptionsSchema.optional(),
  subscriberId: z.string().nullish(),
  connectionId: z.string().optional()
});

export const AwsSecretsManagerPkiSyncListItemSchema = z.object({
  name: z.literal("AWS Secrets Manager"),
  connection: z.literal(AppConnection.AWS),
  destination: z.literal(PkiSync.AwsSecretsManager),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(true)
});
