import { z } from "zod";

import { openApiHidden } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { buildCertificateNameSchemaTestName } from "@app/services/pki-sync/pki-sync-certificate-name-fns";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import { PkiSyncSchema } from "@app/services/pki-sync/pki-sync-schemas";

import { CHEF_PKI_SYNC_CERTIFICATE_NAMING, CHEF_PKI_SYNC_DATA_BAG_NAMING } from "./chef-pki-sync-constants";

export const ChefPkiSyncConfigSchema = z.object({
  dataBagName: z
    .string()
    .trim()
    .min(1, "Data bag name required")
    .max(255, "Data bag name cannot exceed 255 characters")
    .refine(
      (name) => CHEF_PKI_SYNC_DATA_BAG_NAMING.NAME_PATTERN.test(name),
      "Data bag name can only contain alphanumeric characters, underscores, and hyphens"
    )
});

const ChefFieldMappingsSchema = z.object({
  certificate: z.string().min(1, "Certificate field name is required").default("certificate"),
  privateKey: z.string().min(1, "Private key field name is required").default("private_key"),
  certificateChain: z.string().min(1, "Certificate chain field name is required").default("certificate_chain"),
  caCertificate: z.string().min(1, "CA certificate field name is required").default("ca_certificate")
});

const ChefPkiSyncOptionsSchema = z.object({
  canImportCertificates: z.boolean().default(false),
  canRemoveCertificates: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  preserveItemOnRenewal: z.boolean().default(true),
  updateExistingCertificates: z.boolean().default(true),
  certificateNameSchema: z
    .string()
    .trim()
    .min(1, "Certificate name schema is required")
    .refine(
      (schema) => {
        if (!schema.includes("{{certificateId}}") && !schema.includes("{{shortCertificateId}}")) {
          return false;
        }

        const testName = buildCertificateNameSchemaTestName(schema);

        const hasForbiddenChars = CHEF_PKI_SYNC_CERTIFICATE_NAMING.FORBIDDEN_CHARACTERS.split("").some((char) =>
          testName.includes(char)
        );

        return (
          CHEF_PKI_SYNC_CERTIFICATE_NAMING.NAME_PATTERN.test(testName) &&
          !hasForbiddenChars &&
          testName.length >= CHEF_PKI_SYNC_CERTIFICATE_NAMING.MIN_LENGTH &&
          testName.length <= CHEF_PKI_SYNC_CERTIFICATE_NAMING.MAX_LENGTH
        );
      },
      {
        message:
          "Certificate item name schema must include the {{certificateId}} or {{shortCertificateId}} placeholder and result in names that contain only alphanumeric characters, underscores, and hyphens and be 1-255 characters long for Chef data bag items."
      }
    ),
  fieldMappings: ChefFieldMappingsSchema.optional().default({
    certificate: "certificate",
    privateKey: "private_key",
    certificateChain: "certificate_chain",
    caCertificate: "ca_certificate"
  })
});

export const ChefPkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.Chef),
  destinationConfig: ChefPkiSyncConfigSchema,
  syncOptions: ChefPkiSyncOptionsSchema
});

export const CreateChefPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().default(true),
  destinationConfig: ChefPkiSyncConfigSchema,
  syncOptions: ChefPkiSyncOptionsSchema,
  subscriberId: z.string().nullish(),
  connectionId: z.string(),
  projectId: z.string().trim().min(1).optional().describe(openApiHidden()),
  applicationId: z.string().uuid().optional(),
  certificateIds: z.array(z.string().uuid()).optional()
});

export const UpdateChefPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: ChefPkiSyncConfigSchema.optional(),
  syncOptions: ChefPkiSyncOptionsSchema.optional(),
  subscriberId: z.string().nullish(),
  connectionId: z.string().optional()
});

export const ChefPkiSyncListItemSchema = z.object({
  name: z.literal("Chef"),
  connection: z.literal(AppConnection.Chef),
  destination: z.literal(PkiSync.Chef),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(true)
});

export { ChefFieldMappingsSchema };
