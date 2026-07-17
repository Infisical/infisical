import RE2 from "re2";
import { z } from "zod";

import { openApiHidden } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { buildCertificateNameSchemaTestName } from "@app/services/pki-sync/pki-sync-certificate-name-fns";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import { PkiSyncSchema } from "@app/services/pki-sync/pki-sync-schemas";

import { KEMP_LOADMASTER_DEFAULT_CA_NAME_SCHEMA, KEMP_LOADMASTER_NAMING } from "./kemp-loadmaster-pki-sync-constants";

const VIRTUAL_SERVICE_ID_PATTERN = new RE2("^[0-9]+$");

export const KempLoadMasterPkiSyncConfigSchema = z.object({
  virtualServiceId: z
    .string()
    .trim()
    .max(10, "Virtual Service ID cannot exceed 10 characters")
    .refine((val) => VIRTUAL_SERVICE_ID_PATTERN.test(val), {
      message: "Virtual Service ID must be the numeric Virtual Service index shown on the LoadMaster"
    })
    .optional()
});

export const KempLoadMasterPkiSyncOptionsSchema = z.object({
  canRemoveCertificates: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  preserveItemOnRenewal: z.boolean().default(true),
  syncCaCertificates: z.boolean().default(true),
  caCertificateNameSchema: z
    .string()
    .trim()
    .default(KEMP_LOADMASTER_DEFAULT_CA_NAME_SCHEMA)
    .refine(
      (schema) => {
        const testName = schema
          .replace(new RE2("\\{\\{fingerprint\\}\\}", "g"), "0".repeat(24))
          .replace(new RE2("\\{\\{commonName\\}\\}", "g"), "common-name");
        const hasForbiddenChars = KEMP_LOADMASTER_NAMING.FORBIDDEN_CHARACTERS.split("").some((char) =>
          testName.includes(char)
        );
        return KEMP_LOADMASTER_NAMING.NAME_PATTERN.test(testName) && !hasForbiddenChars;
      },
      {
        message:
          "CA certificate name schema must result in names 1-251 characters long containing only alphanumeric characters, hyphens (-), underscores (_), and periods (.). Available placeholders: {{fingerprint}} (recommended so each CA gets a unique name) and {{commonName}}. A schema with no placeholder can hold only one CA certificate. Defaults to Infisical-ca-{{fingerprint}}."
      }
    ),
  certificateNameSchema: z
    .string()
    .trim()
    .min(1, "Certificate name schema is required")
    .refine(
      (schema) => {
        const testName = buildCertificateNameSchemaTestName(schema);

        const hasForbiddenChars = KEMP_LOADMASTER_NAMING.FORBIDDEN_CHARACTERS.split("").some((char) =>
          testName.includes(char)
        );

        const hasCertificateIdentifier =
          schema.includes("{{certificateId}}") || schema.includes("{{shortCertificateId}}");

        return hasCertificateIdentifier && KEMP_LOADMASTER_NAMING.NAME_PATTERN.test(testName) && !hasForbiddenChars;
      },
      {
        message:
          "Certificate name schema must include the {{certificateId}} or {{shortCertificateId}} placeholder so each certificate gets a unique identifier, contain only alphanumeric characters, hyphens (-), underscores (_), and periods (.), and be 1-251 characters long for Kemp LoadMaster. It can also include {{profileId}}, {{applicationId}}, {{applicationName}}, and {{commonName}} placeholders."
      }
    )
});

export const KempLoadMasterPkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.KempLoadMaster),
  destinationConfig: KempLoadMasterPkiSyncConfigSchema,
  syncOptions: KempLoadMasterPkiSyncOptionsSchema
});

export const CreateKempLoadMasterPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().default(true),
  destinationConfig: KempLoadMasterPkiSyncConfigSchema,
  syncOptions: KempLoadMasterPkiSyncOptionsSchema,
  subscriberId: z.string().nullish(),
  connectionId: z.string(),
  projectId: z.string().trim().min(1).optional().describe(openApiHidden()),
  applicationId: z.string().uuid().optional(),
  certificateIds: z.array(z.string().uuid()).optional()
});

export const UpdateKempLoadMasterPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: KempLoadMasterPkiSyncConfigSchema.optional(),
  syncOptions: KempLoadMasterPkiSyncOptionsSchema.optional(),
  subscriberId: z.string().nullish(),
  connectionId: z.string().optional()
});

export const KempLoadMasterPkiSyncListItemSchema = z.object({
  name: z.literal("Kemp LoadMaster"),
  connection: z.literal(AppConnection.KempLoadMaster),
  destination: z.literal(PkiSync.KempLoadMaster),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(true)
});
