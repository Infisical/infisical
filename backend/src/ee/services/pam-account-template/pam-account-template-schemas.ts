import RE2 from "re2";
import { z } from "zod";

import { PasswordRequirementsSchema } from "@app/ee/services/secret-rotation-v2/shared/general/password-requirements-schema";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";
import { patternsStringSchema } from "../pam/pam-policies";

export const PamRotationConfigSchema = z.object({
  enabled: z.boolean(),
  intervalSeconds: z.number().int().min(3600).max(31_536_000).nullable() // 1 hour .. 1 year, or null for manual
});

export const PamHeartbeatConfigSchema = z.object({
  enabled: z.boolean(),
  intervalSeconds: z.number().int().min(3600).max(31_536_000).nullable() // 1 hour .. 1 year, or null for manual
});

// Daily, matching the interval the template form offers by default.
export const DEFAULT_HEARTBEAT_CONFIG: TPamHeartbeatConfig = { enabled: true, intervalSeconds: 86_400 };

export const PamRecordingS3ConfigSchema = z.object({
  bucket: z.string().trim().min(1),
  // S3-compatible connections take the region from their endpoint
  region: z.nativeEnum(AWSRegion).optional(),
  keyPrefix: z.string().trim().optional()
});

const AZURE_CONTAINER_NAME = new RE2(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const PamRecordingAzureBlobConfigSchema = z.object({
  container: z
    .string()
    .trim()
    .min(3, "Container name must be at least 3 characters")
    .max(63, "Container name cannot exceed 63 characters")
    .refine(
      (name) => AZURE_CONTAINER_NAME.test(name),
      "Container name can only contain lowercase letters, numbers and single hyphens between them"
    ),
  keyPrefix: z
    .string()
    .trim()
    .max(256, "Key prefix cannot exceed 256 characters")
    .refine(
      (prefix) =>
        !["\\", "?", "#"].some((char) => prefix.includes(char)) &&
        !prefix.split("/").some((segment) => segment === "." || segment === ".."),
      "Key prefix can't contain '.' or '..' folders, backslashes, '?' or '#'"
    )
    .optional()
});

export const PamAccountSettingsOverridesSchema = z.object({
  recordingS3Config: PamRecordingS3ConfigSchema.optional(),
  recordingAzureBlobConfig: PamRecordingAzureBlobConfigSchema.optional()
});

export const PamTemplateSettingsSchema = z.object({
  recordingEnabled: z.boolean().default(true),
  recordingStorageBackend: z.nativeEnum(PamRecordingStorageBackend).default(PamRecordingStorageBackend.Postgres),
  recordingS3Config: PamRecordingS3ConfigSchema.optional(),
  recordingAzureBlobConfig: PamRecordingAzureBlobConfigSchema.optional(),
  passwordRequirements: PasswordRequirementsSchema.optional(),
  rotation: PamRotationConfigSchema.optional(),
  heartbeat: PamHeartbeatConfigSchema.optional(),
  sessionLogMaskingPatterns: z.string().optional(),
  sessionLogMaskingBuiltInDetection: z.boolean().default(false)
});

export const PamTemplateSettingsInputSchema = PamTemplateSettingsSchema.extend({
  sessionLogMaskingPatterns: patternsStringSchema().optional(),
  sessionLogMaskingBuiltInDetection: z.boolean().optional()
});

export type TPamTemplateSettings = z.infer<typeof PamTemplateSettingsSchema>;
export type TPamTemplateSettingsInput = z.infer<typeof PamTemplateSettingsInputSchema>;
export type TPamAccountSettingsOverrides = z.infer<typeof PamAccountSettingsOverridesSchema>;
export type TPamRecordingS3Config = z.infer<typeof PamRecordingS3ConfigSchema>;
export type TPamRecordingAzureBlobConfig = z.infer<typeof PamRecordingAzureBlobConfigSchema>;
export type TPamRotationConfig = z.infer<typeof PamRotationConfigSchema>;
export type TPamHeartbeatConfig = z.infer<typeof PamHeartbeatConfigSchema>;
