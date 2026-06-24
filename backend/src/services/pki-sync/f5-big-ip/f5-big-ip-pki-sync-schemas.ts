import { z } from "zod";

import { openApiHidden } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { buildCertificateNameSchemaTestName } from "@app/services/pki-sync/pki-sync-certificate-name-fns";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import { PkiSyncSchema } from "@app/services/pki-sync/pki-sync-schemas";

import { F5_BIG_IP_NAMING, F5BigIpProfileType } from "./f5-big-ip-pki-sync-constants";

const hasProfileBinding = (profileType: F5BigIpProfileType | undefined) =>
  profileType !== undefined && profileType !== F5BigIpProfileType.None;

export const F5BigIpPkiSyncConfigSchema = z
  .object({
    partition: z
      .string()
      .trim()
      .min(1, "Partition cannot be empty")
      .max(255, "Partition cannot exceed 255 characters")
      .regex(
        F5_BIG_IP_NAMING.NAME_PATTERN,
        "Partition must contain only alphanumeric characters, hyphens, underscores, and periods"
      )
      .optional(),
    profileType: z.nativeEnum(F5BigIpProfileType).optional(),
    profileName: z
      .string()
      .trim()
      .min(1, "Profile name cannot be empty")
      .max(255, "Profile name cannot exceed 255 characters")
      .regex(
        F5_BIG_IP_NAMING.NAME_PATTERN,
        "Profile name must contain only alphanumeric characters, hyphens, underscores, and periods"
      )
      .optional(),
    createProfileIfMissing: z.boolean().optional(),
    parentProfile: z
      .string()
      .trim()
      .min(1, "Parent profile cannot be empty")
      .max(511, "Parent profile cannot exceed 511 characters")
      .optional()
  })
  .transform((value) =>
    hasProfileBinding(value.profileType)
      ? value
      : { ...value, profileName: undefined, createProfileIfMissing: false, parentProfile: undefined }
  )
  .transform((value) => (value.createProfileIfMissing ? value : { ...value, parentProfile: undefined }))
  .refine((value) => !hasProfileBinding(value.profileType) || Boolean(value.profileName), {
    message: "Profile name is required when a profile type is selected",
    path: ["profileName"]
  });

export const F5BigIpPkiSyncOptionsSchema = z.object({
  canRemoveCertificates: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  preserveItemOnRenewal: z.boolean().default(true),
  certificateNameSchema: z
    .string()
    .optional()
    .refine(
      (schema) => {
        if (!schema) return true;

        if (!schema.includes("{{certificateId}}")) {
          return false;
        }

        const testName = buildCertificateNameSchemaTestName(schema);

        const hasForbiddenChars = F5_BIG_IP_NAMING.FORBIDDEN_CHARACTERS.split("").some((char) =>
          testName.includes(char)
        );

        return F5_BIG_IP_NAMING.NAME_PATTERN.test(testName) && !hasForbiddenChars;
      },
      {
        message:
          "Certificate name schema must include the {{certificateId}} placeholder and result in names that contain only alphanumeric characters, hyphens (-), underscores (_), and periods (.) and be 1-255 characters long for F5 BIG-IP. Available placeholders: {{certificateId}}, {{profileId}}, {{applicationId}}, {{commonName}}"
      }
    )
});

export const F5BigIpPkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.F5BigIp),
  destinationConfig: F5BigIpPkiSyncConfigSchema,
  syncOptions: F5BigIpPkiSyncOptionsSchema
});

export const CreateF5BigIpPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().default(true),
  destinationConfig: F5BigIpPkiSyncConfigSchema,
  syncOptions: F5BigIpPkiSyncOptionsSchema.optional().default({}),
  subscriberId: z.string().nullish(),
  connectionId: z.string(),
  projectId: z.string().trim().min(1).optional().describe(openApiHidden()),
  applicationId: z.string().uuid().optional(),
  certificateIds: z.array(z.string().uuid()).optional()
});

export const UpdateF5BigIpPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: F5BigIpPkiSyncConfigSchema.optional(),
  syncOptions: F5BigIpPkiSyncOptionsSchema.optional(),
  subscriberId: z.string().nullish(),
  connectionId: z.string().optional()
});

export const F5BigIpPkiSyncListItemSchema = z.object({
  name: z.literal("F5 BIG-IP"),
  connection: z.literal(AppConnection.F5BigIp),
  destination: z.literal(PkiSync.F5BigIp),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(true)
});
