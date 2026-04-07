import RE2 from "re2";
import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import { PkiSyncSchema } from "@app/services/pki-sync/pki-sync-schemas";

import { NETSCALER_NAMING } from "./netscaler-pki-sync-constants";

export const NetScalerPkiSyncConfigSchema = z.object({
  vserverName: z.string().max(127, "vServer name cannot exceed 127 characters").optional()
});

export const NetScalerPkiSyncOptionsSchema = z.object({
  canRemoveCertificates: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  preserveItemOnRenewal: z.boolean().default(true),
  certificateNameSchema: z
    .string()
    .optional()
    .refine(
      (schema) => {
        if (!schema) return true;

        const testName = schema
          .replace(new RE2("\\{\\{certificateId\\}\\}", "g"), "")
          .replace(new RE2("\\{\\{environment\\}\\}", "g"), "");

        const hasForbiddenChars = NETSCALER_NAMING.FORBIDDEN_CHARACTERS.split("").some((char) =>
          testName.includes(char)
        );

        return NETSCALER_NAMING.NAME_PATTERN.test(testName) && !hasForbiddenChars;
      },
      {
        message:
          "Certificate name schema must result in names that contain only alphanumeric characters, hyphens (-), underscores (_), and periods (.) and be 1-255 characters long for NetScaler"
      }
    )
});

export const NetScalerPkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.NetScaler),
  destinationConfig: NetScalerPkiSyncConfigSchema,
  syncOptions: NetScalerPkiSyncOptionsSchema
});

export const CreateNetScalerPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().default(true),
  destinationConfig: NetScalerPkiSyncConfigSchema,
  syncOptions: NetScalerPkiSyncOptionsSchema.optional().default({}),
  subscriberId: z.string().nullish(),
  connectionId: z.string(),
  projectId: z.string().trim().min(1),
  certificateIds: z.array(z.string().uuid()).optional()
});

export const UpdateNetScalerPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: NetScalerPkiSyncConfigSchema.optional(),
  syncOptions: NetScalerPkiSyncOptionsSchema.optional(),
  subscriberId: z.string().nullish(),
  connectionId: z.string().optional()
});

export const NetScalerPkiSyncListItemSchema = z.object({
  name: z.literal("NetScaler"),
  connection: z.literal(AppConnection.NetScaler),
  destination: z.literal(PkiSync.NetScaler),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(true)
});
