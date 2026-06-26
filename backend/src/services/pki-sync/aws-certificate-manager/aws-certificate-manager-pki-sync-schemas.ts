import { z } from "zod";

import { openApiHidden } from "@app/server/lib/schemas";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { buildCertificateNameSchemaTestName } from "@app/services/pki-sync/pki-sync-certificate-name-fns";
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
    .trim()
    .min(1, "Certificate name schema is required")
    .refine(
      (schema) => {
        // Validate that {{certificateId}} placeholder is present
        if (!schema.includes("{{certificateId}}") && !schema.includes("{{shortCertificateId}}")) {
          return false;
        }

        const testName = buildCertificateNameSchemaTestName(schema);

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
          "Certificate name schema must include the {{certificateId}} or {{shortCertificateId}} placeholder and result in names that contain only alphanumeric characters, spaces, hyphens, and underscores and be 1-256 characters long when compiled for AWS Certificate Manager. Available placeholders: {{certificateId}}, {{shortCertificateId}}, {{profileId}}, {{applicationId}}, {{applicationName}}, {{commonName}}"
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
  syncOptions: AwsCertificateManagerPkiSyncOptionsSchema,
  subscriberId: z.string().nullish(),
  connectionId: z.string(),
  projectId: z.string().trim().min(1).optional().describe(openApiHidden()),
  applicationId: z.string().uuid().optional(),
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
