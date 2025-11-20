import RE2 from "re2";
import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
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
          "Certificate item name schema must include {{certificateId}} placeholder and result in names that contain only alphanumeric characters, underscores, and hyphens and be 1-255 characters long for Chef data bag items."
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
  name: z.string().trim().min(1).max(64),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().default(true),
  destinationConfig: ChefPkiSyncConfigSchema,
  syncOptions: ChefPkiSyncOptionsSchema.optional().default({}),
  subscriberId: z.string().nullish(),
  connectionId: z.string(),
  projectId: z.string().trim().min(1),
  certificateIds: z.array(z.string().uuid()).optional()
});

export const UpdateChefPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
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
