import RE2 from "re2";
import { z } from "zod";

import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import { PkiSyncSchema } from "@app/services/pki-sync/pki-sync-schemas";

import { AWS_CERTIFICATE_MANAGER_CERTIFICATE_NAMING } from "./aws-certificate-manager-pki-sync-constants";

export const AwsCertificateManagerPkiSyncConfigSchema = z.object({
  region: z.nativeEnum(AWSRegion)
});

const AwsCertificateManagerPkiSyncOptionsSchema = z.object({
  canImportCertificates: z.boolean().default(false),
  canRemoveCertificates: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  preserveArn: z.boolean().default(true),
  certificateNameSchema: z
    .string()
    .optional()
    .refine(
      (schema) => {
        if (!schema) return true;

        // Validate that {{certificateId}} placeholder is present
        if (!schema.includes("{{certificateId}}")) {
          return false;
        }

        const testName = schema
          .replace(new RE2("\\{\\{certificateId\\}\\}", "g"), "test-cert-id")
          .replace(new RE2("\\{\\{profileId\\}\\}", "g"), "test-profile-id")
          .replace(new RE2("\\{\\{commonName\\}\\}", "g"), "test-common-name")
          .replace(new RE2("\\{\\{friendlyName\\}\\}", "g"), "test-friendly-name")
          .replace(new RE2("\\{\\{environment\\}\\}", "g"), "test-env");

        const hasForbiddenChars = AWS_CERTIFICATE_MANAGER_CERTIFICATE_NAMING.FORBIDDEN_CHARACTERS.split("").some(
          (char) => testName.includes(char)
        );

        return (
          AWS_CERTIFICATE_MANAGER_CERTIFICATE_NAMING.NAME_PATTERN.test(testName) &&
          !hasForbiddenChars &&
          testName.length >= AWS_CERTIFICATE_MANAGER_CERTIFICATE_NAMING.MIN_LENGTH &&
          testName.length <= AWS_CERTIFICATE_MANAGER_CERTIFICATE_NAMING.MAX_LENGTH
        );
      },
      {
        message:
          "Certificate name schema must include {{certificateId}} placeholder and result in names that contain only alphanumeric characters, spaces, hyphens, and underscores and be 1-256 characters long when compiled for AWS Certificate Manager. Available placeholders: {{certificateId}}, {{profileId}}, {{commonName}}, {{friendlyName}}, {{environment}}"
      }
    )
});

export const AwsCertificateManagerPkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.AwsCertificateManager),
  destinationConfig: AwsCertificateManagerPkiSyncConfigSchema,
  syncOptions: AwsCertificateManagerPkiSyncOptionsSchema
});

export const CreateAwsCertificateManagerPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().default(true),
  destinationConfig: AwsCertificateManagerPkiSyncConfigSchema,
  syncOptions: AwsCertificateManagerPkiSyncOptionsSchema.optional().default({}),
  subscriberId: z.string().nullish(),
  connectionId: z.string(),
  projectId: z.string().trim().min(1),
  certificateIds: z.array(z.string().uuid()).optional()
});

export const UpdateAwsCertificateManagerPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: AwsCertificateManagerPkiSyncConfigSchema.optional(),
  syncOptions: AwsCertificateManagerPkiSyncOptionsSchema.optional(),
  subscriberId: z.string().nullish(),
  connectionId: z.string().optional()
});

export const AwsCertificateManagerPkiSyncListItemSchema = z.object({
  name: z.literal("AWS Certificate Manager"),
  connection: z.literal(AppConnection.AWS),
  destination: z.literal(PkiSync.AwsCertificateManager),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(true)
});
