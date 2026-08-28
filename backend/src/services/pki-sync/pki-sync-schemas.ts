import RE2 from "re2";
import { z } from "zod";

import { HOSTNAME_MAX_LENGTH, isValidHostname } from "@app/lib/validator/validate-hostname";

import { buildCertificateNameSchemaTestName } from "./pki-sync-certificate-name-fns";
import { PkiSync, PkiSyncStatus } from "./pki-sync-enums";
import { HOST_COMMAND_MAX_LENGTH } from "./pki-sync-host-command-fns";

export const HostCommandSchema = z
  .string()
  .trim()
  .max(HOST_COMMAND_MAX_LENGTH, `Command must be at most ${HOST_COMMAND_MAX_LENGTH} characters`)
  .nullable()
  .optional();

export const PkiSyncTargetPortSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(65535)
  .optional()
  .describe("The port to reach the target host on. Defaults to the protocol's standard port.");

export const PkiSyncTargetHostSchema = z
  .string()
  .trim()
  .min(1, "Target host is required")
  .max(HOSTNAME_MAX_LENGTH, "Target host is too long")
  .refine(isValidHostname, {
    message: "Target host must be a hostname or IP address (for example server01.corp.example.com or 10.0.0.5)"
  })
  .optional();

// Sync options shared by every destination. Destinations extend this with their own
// certificateNameSchema and any extra options.
export const BasePkiSyncOptionsSchema = z.object({
  canRemoveCertificates: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  preserveItemOnRenewal: z.boolean().default(true),
  healthCheckCommand: HostCommandSchema,
  postSyncCommand: HostCommandSchema
});

// Builds a destination's certificateNameSchema validator. The compiled name must match the
// destination's character rules; pass requireCertificateIdentifier when every certificate must
// resolve to a unique name (so a static schema cannot collide/overwrite across certificates).
export const buildDestinationCertificateNameSchema = (options: {
  naming: { NAME_PATTERN: RE2; FORBIDDEN_CHARACTERS: string };
  message: string;
  requireCertificateIdentifier?: boolean;
}) =>
  z
    .string()
    .trim()
    .min(1, "Certificate name schema is required")
    .refine(
      (schema) => {
        const testName = buildCertificateNameSchemaTestName(schema);
        const hasForbiddenChars = options.naming.FORBIDDEN_CHARACTERS.split("").some((char) => testName.includes(char));
        const hasCertificateIdentifier =
          !options.requireCertificateIdentifier ||
          schema.includes("{{certificateId}}") ||
          schema.includes("{{shortCertificateId}}");
        return hasCertificateIdentifier && options.naming.NAME_PATTERN.test(testName) && !hasForbiddenChars;
      },
      { message: options.message }
    );

// Schema for PKI sync options configuration
export const PkiSyncOptionsSchema = z.object({
  canImportCertificates: z.boolean(),
  canRemoveCertificates: z.boolean().optional(),
  includeRootCa: z.boolean().optional().default(false),
  certificateNameSchema: z
    .string()
    .trim()
    .min(1, "Certificate name schema is required")
    .refine(
      (val) => {
        const allowedPlaceholdersRegexPart = [
          "{{certificateId}}",
          "{{shortCertificateId}}",
          "{{profileId}}",
          "{{applicationId}}",
          "{{applicationName}}",
          "{{commonName}}"
        ]
          .map((p) => p.replace(new RE2(/[-/\\^$*+?.()|[\]{}]/g), "\\$&")) // Escape regex special characters
          .join("|");

        const allowedContentRegex = new RE2(`^([a-zA-Z0-9_\\-/]|${allowedPlaceholdersRegexPart})*$`);
        return allowedContentRegex.test(val);
      },
      {
        message:
          "Certificate name schema may include the {{certificateId}}, {{shortCertificateId}}, {{profileId}}, {{applicationId}}, {{applicationName}}, and {{commonName}} placeholders. Only alphanumeric characters (a-z, A-Z, 0-9), dashes (-), underscores (_), and slashes (/) are allowed besides the placeholders. A schema with no placeholder can be linked to only one certificate."
      }
    )
});

// Schema for destination-specific configurations
export const PkiSyncDestinationConfigSchema = z.object({
  destination: z.nativeEnum(PkiSync),
  config: z.record(z.unknown())
});

// Base PKI sync schema for API responses
export const PkiSyncSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(256),
  description: z.string().nullable().optional(),
  destination: z.nativeEnum(PkiSync),
  isAutoSyncEnabled: z.boolean(),
  destinationConfig: z.record(z.unknown()),
  syncOptions: z.record(z.unknown()),
  projectId: z.string().uuid(),
  subscriberId: z.string().uuid().nullable().optional(),
  connectionId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  syncStatus: z.string().nullable().optional(),
  lastSyncedAt: z.date().nullable().optional(),
  lastHealthCheckRanAt: z.date().nullable().optional(),
  lastHealthCheckStatus: z.nativeEnum(PkiSyncStatus).nullable().optional(),
  lastHealthCheckMessage: z.string().nullable().optional()
});

export const BaseHealthCheckTestSchema = z.object({
  connectionId: z.string().uuid(),
  applicationId: z.string().uuid().optional(),
  syncId: z.string().uuid().optional(),
  certificateIds: z.array(z.string().uuid()).max(100).optional()
});
